import json

from taupin import engine_parity


def test_committed_parity_fixture_matches_engine():
    # web/test/engine.test.mjs checks the page's port against this file; a stale file would let the
    # port drift from the engine without a failing test.
    committed = json.loads(engine_parity.OUT.read_text())
    assert committed == json.loads(json.dumps(engine_parity.cases()))
