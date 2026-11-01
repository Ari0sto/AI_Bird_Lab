import json
import os
import time
import pika

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "guest")
RABBITMQ_PASSWORD = os.getenv("RABBITMQ_PASSWORD", "guest")

QUEUE_NAME = "birdlab.demo"


def process_message(channel, method, properties, body):
    try:
        message = json.loads(body.decode("utf-8"))

        print("RabbitMQ message received:", flush=True)
        print(
            json.dumps(message, ensure_ascii=False, indent=2),
            flush=True
        )

        channel.basic_ack(
            delivery_tag=method.delivery_tag
        )

    except Exception as error:
        print(f"Message processing error: {error}", flush=True)

        channel.basic_nack(
            delivery_tag=method.delivery_tag,
            requeue=False
        )


def main():
    credentials = pika.PlainCredentials(
        RABBITMQ_USER,
        RABBITMQ_PASSWORD
    )

    while True:
        connection = None

        try:
            parameters = pika.ConnectionParameters(
                host=RABBITMQ_HOST,
                credentials=credentials,
                heartbeat=30,
                blocked_connection_timeout=30
            )

            connection = pika.BlockingConnection(parameters)
            channel = connection.channel()

            channel.queue_declare(
                queue=QUEUE_NAME,
                durable=True
            )

            channel.basic_qos(prefetch_count=1)

            channel.basic_consume(
                queue=QUEUE_NAME,
                on_message_callback=process_message,
                auto_ack=False
            )

            print(
                f"Python Worker is listening on {QUEUE_NAME}",
                flush=True
            )

            channel.start_consuming()

        except (pika.exceptions.AMQPError, OSError) as error:
            print(f"RabbitMQ connection error: {error}", flush=True)

        finally:
            if connection is not None and connection.is_open:
                connection.close()

        print("Reconnecting in 5 seconds...", flush=True)
        time.sleep(5)


if __name__ == "__main__":
    main()
