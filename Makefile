# worktable — the commands CI runs, runnable locally by the same names.
#
# NETDUST_FLOW is where the runtime lives. The default is the symlink
# convention (~/.claude/netdust-flow); CI overrides it with a checkout.
NETDUST_FLOW ?= $(HOME)/.claude/netdust-flow

.PHONY: help deps test contract craft flows ui check

help:
	@echo "make deps      install test/authoring dependencies"
	@echo "make test      server + gate suite"
	@echo "make contract  every gate command is understood by the runtime"
	@echo "make craft     every craft path a flow declares exists"
	@echo "make flows     lint domain flows, verify gates exist, compile twins"
	@echo "make ui        typecheck + e2e (needs npm ci in ui/ first)"
	@echo "make check     test + contract + flows — this repo's gate command"

deps:
	pip install -r requirements-dev.txt

test:
	WORKTABLE_NETDUST_FLOW=$(NETDUST_FLOW) python3 tests/server-tests.py

# The break this catches is the one that shipped: a flow calling the
# runtime with a flag the runtime does not have. argparse exits 2, and
# our flows route 2 as `rejected` — an approval read as a refusal.
contract:
	WORKTABLE_NETDUST_FLOW=$(NETDUST_FLOW) python3 tests/runtime-contract.py

# Craft that points at nothing is the failure I5 names: the agent reads
# the reference, finds no file, and proceeds without it. Nothing else
# in the system notices.
craft:
	python3 bin/craft-check.py

flows:
	python3 $(NETDUST_FLOW)/bin/flow-lint.py flows/*.yaml \
		--check-gates --project . \
		--bind worktable=$(CURDIR) --bind netdust_flow=$(NETDUST_FLOW) \
		--compile

ui:
	cd ui && npx tsc -b --noEmit && npm run test:ci

check: test contract craft flows
