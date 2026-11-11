import importlib
import json
import runpy
import sys
import types
import unittest
from unittest import mock


class FakeAMQPError(Exception):
    """Stand-in for pika.exceptions.AMQPError."""


class StopWorkerLoop(Exception):
    """Stops the worker's intentionally infinite reconnect loop in tests."""


def setUpModule():
    global worker
    fake_pika = types.ModuleType("pika")
    fake_pika.exceptions = types.SimpleNamespace(AMQPError=FakeAMQPError)
    fake_pika.PlainCredentials = mock.Mock(name="PlainCredentials")
    fake_pika.ConnectionParameters = mock.Mock(name="ConnectionParameters")
    fake_pika.BlockingConnection = mock.Mock(name="BlockingConnection")
    with mock.patch.dict(sys.modules, {"pika": fake_pika}):
        worker = importlib.import_module("backend.rabbitmq_worker")


class ProcessMessageTests(unittest.TestCase):
    def setUp(self):
        self.channel = mock.Mock()
        self.method = types.SimpleNamespace(delivery_tag=42)

    def test_valid_json_is_acknowledged(self):
        payload = {"source": "central-server", "text": "Привет", "count": 2}
        with mock.patch("builtins.print") as printed:
            worker.process_message(self.channel, self.method, None,
                                   json.dumps(payload).encode("utf-8"))
        self.channel.basic_ack.assert_called_once_with(delivery_tag=42)
        self.channel.basic_nack.assert_not_called()
        self.assertEqual(printed.call_count, 2)
        self.assertIn("Привет", printed.call_args_list[1].args[0])
        self.assertEqual(printed.call_args_list[0].kwargs, {"flush": True})

    def test_json_array_is_accepted(self):
        with mock.patch("builtins.print"):
            worker.process_message(self.channel, self.method, None, b'[1, 2]')
        self.channel.basic_ack.assert_called_once_with(delivery_tag=42)
        self.channel.basic_nack.assert_not_called()

    def test_malformed_json_is_rejected_without_requeue(self):
        with mock.patch("builtins.print") as printed:
            worker.process_message(self.channel, self.method, None, b'{broken')
        self.channel.basic_ack.assert_not_called()
        self.channel.basic_nack.assert_called_once_with(delivery_tag=42, requeue=False)
        self.assertIn("Message processing error", printed.call_args.args[0])

    def test_invalid_utf8_is_rejected_without_requeue(self):
        with mock.patch("builtins.print"):
            worker.process_message(self.channel, self.method, None, b'\xff')
        self.channel.basic_ack.assert_not_called()
        self.channel.basic_nack.assert_called_once_with(delivery_tag=42, requeue=False)

    def test_ack_failure_triggers_nack(self):
        self.channel.basic_ack.side_effect = RuntimeError("ack failed")
        with mock.patch("builtins.print") as printed:
            worker.process_message(self.channel, self.method, None, b'{"ok":true}')
        self.channel.basic_ack.assert_called_once_with(delivery_tag=42)
        self.channel.basic_nack.assert_called_once_with(delivery_tag=42, requeue=False)
        self.assertIn("ack failed", printed.call_args.args[0])


class WorkerLoopTests(unittest.TestCase):
    def setUp(self):
        self.credentials = mock.Mock(name="credentials")
        self.parameters = mock.Mock(name="parameters")
        self.connection = mock.Mock(name="connection")
        self.connection.is_open = True
        self.channel = self.connection.channel.return_value
        self.patchers = [
            mock.patch.object(worker.pika, "PlainCredentials", return_value=self.credentials),
            mock.patch.object(worker.pika, "ConnectionParameters", return_value=self.parameters),
            mock.patch.object(worker.pika, "BlockingConnection", return_value=self.connection),
            mock.patch("builtins.print"),
        ]
        self.credential_ctor, self.parameter_ctor, self.connection_ctor, self.printed = [
            p.start() for p in self.patchers
        ]
        for p in self.patchers:
            self.addCleanup(p.stop)

    def run_until_first_reconnect(self):
        with mock.patch.object(worker.time, "sleep", side_effect=StopWorkerLoop) as sleeper:
            with self.assertRaises(StopWorkerLoop):
                worker.main()
        sleeper.assert_called_once_with(5)

    def test_successful_setup_consume_ack_mode_and_close(self):
        self.run_until_first_reconnect()
        self.credential_ctor.assert_called_once_with(worker.RABBITMQ_USER,
                                                     worker.RABBITMQ_PASSWORD)
        self.parameter_ctor.assert_called_once_with(
            host=worker.RABBITMQ_HOST,
            credentials=self.credentials,
            heartbeat=30,
            blocked_connection_timeout=30,
        )
        self.connection_ctor.assert_called_once_with(self.parameters)
        self.connection.channel.assert_called_once_with()
        self.channel.queue_declare.assert_called_once_with(
            queue="birdlab.demo", durable=True)
        self.channel.basic_qos.assert_called_once_with(prefetch_count=1)
        self.channel.basic_consume.assert_called_once_with(
            queue="birdlab.demo",
            on_message_callback=worker.process_message,
            auto_ack=False,
        )
        self.channel.start_consuming.assert_called_once_with()
        self.connection.close.assert_called_once_with()

    def test_amqp_connection_failure_is_handled(self):
        self.connection_ctor.side_effect = FakeAMQPError("broker offline")
        self.run_until_first_reconnect()
        self.connection.close.assert_not_called()
        self.assertTrue(any("RabbitMQ connection error" in c.args[0]
                            for c in self.printed.call_args_list))

    def test_os_error_during_consumption_closes_connection(self):
        self.channel.start_consuming.side_effect = OSError("network down")
        self.run_until_first_reconnect()
        self.connection.close.assert_called_once_with()
        self.assertTrue(any("network down" in c.args[0]
                            for c in self.printed.call_args_list))

    def test_closed_connection_is_not_closed_twice(self):
        self.connection.is_open = False
        self.run_until_first_reconnect()
        self.connection.close.assert_not_called()

    def test_unexpected_error_is_propagated_after_cleanup(self):
        self.channel.queue_declare.side_effect = ValueError("unexpected")
        with mock.patch.object(worker.time, "sleep") as sleeper:
            with self.assertRaisesRegex(ValueError, "unexpected"):
                worker.main()
        self.connection.close.assert_called_once_with()
        sleeper.assert_not_called()

    def test_running_worker_as_script_enters_main(self):
        # Covers the `if __name__ == "__main__"` entrypoint without a broker.
        self.connection_ctor.side_effect = FakeAMQPError("offline")
        with mock.patch.dict(sys.modules, {"pika": worker.pika}):
            with mock.patch.object(worker.time, "sleep", side_effect=StopWorkerLoop):
                with self.assertRaises(StopWorkerLoop):
                    runpy.run_path(worker.__file__, run_name="__main__")
        self.connection_ctor.assert_called_once()

    def test_reconnects_after_broker_failure(self):
        self.connection_ctor.side_effect = [FakeAMQPError("offline"), self.connection]
        with mock.patch.object(worker.time, "sleep", side_effect=[None, StopWorkerLoop]) as sleeper:
            with self.assertRaises(StopWorkerLoop):
                worker.main()
        self.assertEqual(self.connection_ctor.call_count, 2)
        self.assertEqual(sleeper.call_count, 2)
        self.channel.start_consuming.assert_called_once_with()
        self.connection.close.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
