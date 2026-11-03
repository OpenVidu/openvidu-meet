# Proposal

## Why

Every Chinese tag, including `zh-Hant-TW`, `zh-TW`, `zh-HK` and `zh-MO`, selects the Simplified Chinese
bundle. A host or a browser in Taiwan or Hong Kong gets Simplified script even though the language setting
asked for Traditional, and `language="auto"` in a `zh-TW` browser does the same.

## What Changes

Depending on the decision below:

- Option A: Traditional-script tags (`zh-Hant`, `zh-TW`, `zh-HK`, `zh-MO`) are treated as unsupported, so
  the stored preference or English applies and the console warns, as for any unsupported value.
- Option B: today's matching stays; the `language` TSDoc and the `localization` spec say that every `zh-*`
  tag selects Simplified Chinese.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The spec edit of either option is a task, written once the decision is taken:
`localization` "Language tag matching" and "Supported languages".

## Impact

- Embedded API: the `language` attribute and query parameter matching (option A) or its TSDoc (option B).
- Meeting UI and console UI: language selection from `auto` and from the host.
- Not affected: REST API, webhooks, deployment configuration.
- Code: the language tag matching of the i18n service in `shared-meet-components`; typings TSDoc of `language`.
- openvidu.io: the regenerated embedded attributes reference; the localization feature page if it lists
  matching rules.

## Decisions to confirm

- Open product question. Option A: Traditional-script tags are unsupported until a Traditional bundle
  exists. Option B: keep the fallback to Simplified and document it.

## Source

3.10.0 pre-release audit, finding EM-2 (low, verified-live), introduced by #102.
