import unittest
from unittest.mock import AsyncMock, patch

import httpx

from backend import wiki
from backend.settings import NOT_FOUND


def statement(value, rank='normal'):
    return {'rank': rank, 'mainsnak': {'datavalue': {'value': value}}}


def entity(**properties):
    return {'claims': {prop: [statement(v) for v in values]
                       for prop, values in properties.items()}}


class FakeClient:
    """Provide deterministic HTTP responses and record requests."""
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, *, params):
        self.calls.append((url, params))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return httpx.Response(
            response.get('status', 200),
            json=response.get('json', {}),
            request=httpx.Request('GET', url)
        )


def page(title='Common raven', extract=' A  bird\nwith  feathers. ', qid='Q1'):
    p = {'title': title, 'extract': extract}
    if qid is not None:
        p['pageprops'] = {'wikibase_item': qid}
    return {'query': {'pages': [p]}}


class ClaimTests(unittest.TestCase):
    def test_empty_info_has_expected_fields(self):
        self.assertEqual(wiki.empty_info(), {
            'scientific_name': NOT_FOUND, 'family': NOT_FOUND,
            'range': NOT_FOUND, 'diet': NOT_FOUND,
            'description': NOT_FOUND, 'wikipedia_url': None,
            'wikidata_url': None
        })

    def test_claims_only_valid_qids_and_non_deprecated(self):
        obj = {'claims': {'P171': [
            statement({'id': 'Q123'}), statement({'id': 'Q5'}, 'deprecated'),
            statement({'id': 'x5'}), statement('Q8'), statement({'id': 4}),
            {'mainsnak': {}}, statement({'id': 'Q42'})]}}
        self.assertEqual(wiki.claims(obj, 'P171'), ['Q123', 'Q42'])
        self.assertEqual(wiki.claims(obj, 'unknown'), [])

    def test_claim_string_skips_empty_and_deprecated(self):
        obj = {'claims': {'P225': [statement('Old', 'deprecated'),
                                   statement('   '), statement({'id': 'Q1'}),
                                   statement('  Corvus corax  ')]}}
        self.assertEqual(wiki.claim_string(obj, 'P225'), 'Corvus corax')
        self.assertIsNone(wiki.claim_string(obj, 'unknown'))


class RequestTests(unittest.IsolatedAsyncioTestCase):
    async def test_entity_data_returns_requested_entity(self):
        client = FakeClient([{'json': {'entities': {'Q1': {'labels': {'en': {}}}}}}])
        result = await wiki.entity_data(client, 'Q1')
        self.assertEqual(result, {'labels': {'en': {}}})
        self.assertEqual(client.calls[0][1]['ids'], 'Q1')
        self.assertEqual(client.calls[0][1]['props'], 'claims|labels')

    async def test_entity_data_missing_entity(self):
        self.assertEqual(await wiki.entity_data(FakeClient([{'json': {}}]), 'Q99'), {})

    async def test_entity_data_propagates_http_error(self):
        with self.assertRaises(httpx.HTTPStatusError):
            await wiki.entity_data(FakeClient([{'status': 503}]), 'Q1')

    async def test_labels_filters_duplicates_invalid_and_limits_12(self):
        ids = ['bad', 'Q1', 'Q1'] + [f'Q{i}' for i in range(2, 17)]
        unique = [f'Q{i}' for i in range(1, 13)]
        data = {'entities': {
            'Q1': {'labels': {'ru': {'value': 'Ворон'}, 'en': {'value': 'Raven'}}},
            'Q2': {'labels': {'en': {'value': 'Europe'}}},
            'Q3': {'labels': {}}
        }}
        client = FakeClient([{'json': data}])
        self.assertEqual(await wiki.labels_for(client, ids), 'Ворон, Europe')
        self.assertEqual(client.calls[0][1]['ids'], '|'.join(unique))
        self.assertEqual(client.calls[0][1]['languages'], 'ru|en')

    async def test_labels_no_valid_ids_no_request(self):
        client = FakeClient([])
        self.assertEqual(await wiki.labels_for(client, ['invalid', 'Q', '']), NOT_FOUND)
        self.assertEqual(client.calls, [])

    async def test_labels_missing_labels_returns_not_found(self):
        self.assertEqual(await wiki.labels_for(
            FakeClient([{'json': {'entities': {'Q1': {'labels': {}}}}}]), ['Q1']),
            NOT_FOUND)

    async def test_labels_http_error_propagates(self):
        with self.assertRaises(httpx.HTTPStatusError):
            await wiki.labels_for(FakeClient([{'status': 500}]), ['Q1'])


class FamilyTests(unittest.IsolatedAsyncioTestCase):
    async def test_entity_is_family_prefers_russian_label(self):
        data = entity(P105=[{'id': 'Q35409'}])
        data['labels'] = {'ru': {'value': 'Врановые'}, 'en': {'value': 'Corvidae'}}
        self.assertEqual(await wiki.family_for(FakeClient([]), data), 'Врановые')

    async def test_parent_chain_discovers_family(self):
        first = entity(P171=[{'id': 'Q2'}])
        family = entity(P105=[{'id': 'Q35409'}])
        family['labels'] = {'en': {'value': 'Corvidae'}}
        client = FakeClient([{'json': {'entities': {'Q2': family}}}])
        self.assertEqual(await wiki.family_for(client, first), 'Corvidae')
        self.assertEqual(client.calls[0][1]['ids'], 'Q2')

    async def test_parent_cycle_stops(self):
        first = entity(P171=[{'id': 'Q2'}])
        second = entity(P171=[{'id': 'Q2'}])
        client = FakeClient([{'json': {'entities': {'Q2': second}}}])
        self.assertEqual(await wiki.family_for(client, first), NOT_FOUND)
        self.assertEqual(len(client.calls), 1)

    async def test_family_missing_parent(self):
        self.assertEqual(await wiki.family_for(FakeClient([]), {}), NOT_FOUND)

    async def test_family_depth_limit(self):
        client = FakeClient([
            {'json': {'entities': {f'Q{i}': entity(P171=[{'id': f'Q{i+1}'}])}}}
            for i in range(2, 14)
        ])
        self.assertEqual(await wiki.family_for(client, entity(P171=[{'id': 'Q2'}])), NOT_FOUND)
        self.assertEqual(len(client.calls), 12)


class BirdInfoTests(unittest.IsolatedAsyncioTestCase):
    async def bird_with(self, responses, species='COMMON_RAVEN'):
        client = FakeClient(responses)
        with patch.object(wiki.httpx, 'AsyncClient', return_value=client) as factory:
            result = await wiki.bird_info(species)
        factory.assert_called_once()
        self.assertEqual(factory.call_args.kwargs['timeout'], 15.0)
        return result, client

    async def test_missing_page(self):
        result, client = await self.bird_with([{'json': {'query': {'pages': [{'missing': True}]}}}])
        self.assertEqual(result, wiki.empty_info())
        self.assertEqual(client.calls[0][1]['titles'], 'Common raven')

    async def test_no_pages(self):
        result, _ = await self.bird_with([{'json': {}}])
        self.assertEqual(result, wiki.empty_info())

    async def test_page_without_qid_preserves_description(self):
        result, _ = await self.bird_with([{'json': page(qid=None)}])
        self.assertEqual(result['description'], 'A bird with feathers.')
        self.assertEqual(result['wikipedia_url'], 'https://en.wikipedia.org/wiki/Common_raven')
        self.assertIsNone(result['wikidata_url'])
        self.assertEqual(result['scientific_name'], NOT_FOUND)

    async def test_invalid_qid(self):
        result, client = await self.bird_with([{'json': page(qid='not-a-QID')}])
        self.assertEqual(len(client.calls), 1)
        self.assertEqual(result['scientific_name'], NOT_FOUND)

    async def test_missing_scientific_name(self):
        result, client = await self.bird_with([
            {'json': page()}, {'json': {'entities': {'Q1': entity(P225=[])}}}
        ])
        self.assertEqual(len(client.calls), 2)
        self.assertEqual(result['description'], 'A bird with feathers.')
        self.assertIsNone(result['wikidata_url'])

    async def test_full_enrichment_range_priority_and_diet(self):
        bird = entity(P225=['Corvus corax'], P2341=[{'id': 'Q2'}],
                      P183=[{'id': 'Q3'}], P1034=[{'id': 'Q4'}],
                      P171=[{'id': 'Q5'}])
        family = entity(P105=[{'id': 'Q35409'}])
        family['labels'] = {'en': {'value': 'Corvidae'}}
        response_list = [
            {'json': page()},
            {'json': {'entities': {'Q1': bird}}},
            {'json': {'entities': {'Q5': family}}},
            {'json': {'entities': {'Q2': {'labels': {'en': {'value': 'Northern Hemisphere'}}}}}},
            {'json': {'entities': {'Q4': {'labels': {'en': {'value': 'Omnivore'}}}}}}
        ]
        result, client = await self.bird_with(response_list)
        self.assertEqual(result['scientific_name'], 'Corvus corax')
        self.assertEqual(result['family'], 'Corvidae')
        self.assertEqual(result['range'], 'Northern Hemisphere')
        self.assertEqual(result['diet'], 'Omnivore')
        self.assertEqual(result['wikidata_url'], 'https://www.wikidata.org/wiki/Q1')
        self.assertEqual(client.calls[3][1]['ids'], 'Q2')

    async def test_fallback_range_p183_when_p2341_missing(self):
        bird = entity(P225=['Birdus'], P183=[{'id': 'Q8'}])
        result, _ = await self.bird_with([
            {'json': page()}, {'json': {'entities': {'Q1': bird}}},
            {'json': {'entities': {'Q8': {'labels': {'en': {'value': 'Forest'}}}}}}
        ])
        self.assertEqual(result['range'], 'Forest')
        self.assertEqual(result['family'], NOT_FOUND)
        self.assertEqual(result['diet'], NOT_FOUND)

    async def test_wikipedia_http_failure_returns_defaults(self):
        result, _ = await self.bird_with([{'status': 503}])
        self.assertEqual(result, wiki.empty_info())

    async def test_wikidata_failure_preserves_wikipedia_info(self):
        result, _ = await self.bird_with([{'json': page()}, {'status': 503}])
        self.assertEqual(result['description'], 'A bird with feathers.')
        self.assertEqual(result['scientific_name'], NOT_FOUND)

    async def test_secondary_error_preserves_scientific_and_urls(self):
        bird = entity(P225=['Corvus corax'], P171=[{'id': 'Q5'}])
        result, _ = await self.bird_with([
            {'json': page()}, {'json': {'entities': {'Q1': bird}}}, {'status': 503}
        ])
        self.assertEqual(result['scientific_name'], 'Corvus corax')
        self.assertEqual(result['wikidata_url'], 'https://www.wikidata.org/wiki/Q1')
        self.assertEqual(result['family'], NOT_FOUND)

    async def test_description_truncated_to_1400_characters(self):
        result, _ = await self.bird_with([{'json': page(extract='x' * 1800, qid=None)}])
        self.assertEqual(len(result['description']), 1400)

    async def test_non_uppercase_species_whitespace_normalization(self):
        _, client = await self.bird_with([{'json': {'query': {'pages': []}}}],
                                         species='  Eurasian__blue   tit  ')
        self.assertEqual(client.calls[0][1]['titles'], 'Eurasian blue tit')


if __name__ == '__main__':
    unittest.main()
