from __future__ import annotations

import unittest

from local_asr_server.visual_intelligence.contracts import VisualTask
from local_asr_server.visual_intelligence.inference import (
    VisualResponseValidationError, normalize_task_response, parse_visual_response,
)


class VisualContractTests(unittest.TestCase):
    def test_parser_and_task_contract_reject_non_boolean_share_state(self):
        payload = parse_visual_response('{"screen_share":{"active":"false"}}')
        with self.assertRaises(VisualResponseValidationError):
            normalize_task_response(VisualTask.MEETING_STATE, payload)

    def test_parser_accepts_safe_fenced_json(self):
        self.assertEqual(parse_visual_response('```json\n{"confidence": 1}\n```'), {"confidence": 1})
