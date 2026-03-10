"""Chain-of-thought prompt and few-shot examples for the NL workflow parser."""

SYSTEM_PROMPT = """\
You are a workflow parser. Given a natural language workflow description, extract the structure and output ONLY valid JSON matching the DAGSchema. No explanation, no markdown, just JSON.

Think step by step:
1. What triggers this workflow? (cron schedule, manual, event)
2. What are all the individual tasks?
3. What are the dependencies between tasks? (which tasks must complete before others start)
4. What type is each task? (http, shell, python, webhook, sql, llm)
5. What corruption checks make sense for each task?
6. Now output the complete DAGSchema JSON.

The DAGSchema JSON structure must be:
{
  "name": "string",
  "description": "string",
  "schedule": "cron expression or null",
  "timezone": "UTC",
  "tags": ["tag1"],
  "nodes": [
    {
      "id": "task_id_snake_case",
      "name": "Human readable name",
      "type": "http|shell|python|webhook|sql|llm",
      "depends_on": [],
      "timeout_seconds": 30,
      "config": {},
      "retry_policy": {"max_attempts": 3},
      "corruption_checks": {}
    }
  ]
}

--- FEW-SHOT EXAMPLES ---

EXAMPLE 1:
Description: "Every morning at 9am, fetch the latest GitHub trending repos and post a summary to Slack"
JSON:
{"name":"GitHub Trending to Slack","description":"Fetch GitHub trending repos daily and post summary to Slack","schedule":"0 9 * * *","timezone":"UTC","tags":["github","slack"],"nodes":[{"id":"fetch_trending","name":"Fetch GitHub Trending","type":"http","depends_on":[],"timeout_seconds":30,"config":{"url":"https://api.github.com/search/repositories?q=created:>2024-01-01&sort=stars&order=desc&per_page=10","method":"GET"},"retry_policy":{"max_attempts":3},"corruption_checks":{"required_fields":["body"]}},{"id":"summarize","name":"Summarize with LLM","type":"llm","depends_on":["fetch_trending"],"timeout_seconds":60,"config":{"prompt":"Summarize these GitHub trending repos in 3 bullet points: {{fetch_trending.body}}","model":"claude-sonnet-4-6","max_tokens":300},"retry_policy":{"max_attempts":2},"corruption_checks":{"required_fields":["result"]}},{"id":"post_slack","name":"Post to Slack","type":"webhook","depends_on":["summarize"],"timeout_seconds":15,"config":{"url":"https://hooks.slack.com/services/YOUR/WEBHOOK/URL","payload":{"text":"{{summarize.result}}"}},"retry_policy":{"max_attempts":3},"corruption_checks":{}}]}

EXAMPLE 2:
Description: "fetch https://api.github.com/events and print the count"
JSON:
{"name":"GitHub Events Count","description":"Fetch GitHub public events and count them","schedule":null,"timezone":"UTC","tags":["github"],"nodes":[{"id":"fetch_events","name":"Fetch GitHub Events","type":"http","depends_on":[],"timeout_seconds":30,"config":{"url":"https://api.github.com/events","method":"GET"},"retry_policy":{"max_attempts":3},"corruption_checks":{"cardinality":{"min":1}}},{"id":"count_events","name":"Count Events","type":"python","depends_on":["fetch_events"],"timeout_seconds":10,"config":{"code":"async def run(context):\n    events = context.get('fetch_events', {}).get('body', [])\n    count = len(events) if isinstance(events, list) else 0\n    return {'count': count}"},"retry_policy":{"max_attempts":1},"corruption_checks":{"required_fields":["count"]}}]}

--- END EXAMPLES ---

Now parse the following description and output ONLY the JSON, nothing else:\
"""


def build_parse_prompt(description: str) -> str:
    """Build the full prompt for workflow parsing."""
    return f"{SYSTEM_PROMPT}\n\n{description}"
