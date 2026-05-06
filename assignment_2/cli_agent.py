import argparse
import json
import os
import re
import time
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from dotenv import load_dotenv
from google import genai
from google.genai import types


WORKSPACE = Path.cwd().resolve()
DEFAULT_MODEL = "gemini-2.5-flash"
MAX_AGENT_STEPS = 20
FALLBACK_MODELS = (
    "gemini-2.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-2.0-flash-lite",
    "gemini-3.1-flash-lite-preview",
)
USER_AGENT = "Mozilla/5.0 (compatible; Assignment02CLICloneBot/1.0)"


@dataclass
class ToolResult:
    ok: bool
    content: str


class PageParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.title = ""
        self.description = ""
        self.stylesheets: list[str] = []
        self.scripts: list[str] = []
        self.images: list[str] = []
        self.text_chunks: list[str] = []
        self._current_tag = ""
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._current_tag = tag.lower()
        attr_map = {key.lower(): value for key, value in attrs if value}
        if tag.lower() == "title":
            self._in_title = True
        elif tag.lower() == "meta":
            name = (attr_map.get("name") or attr_map.get("property") or "").lower()
            if name in {"description", "og:description"} and attr_map.get("content"):
                self.description = attr_map["content"]
        elif tag.lower() == "link":
            rel = attr_map.get("rel", "").lower()
            href = attr_map.get("href")
            if href and "stylesheet" in rel:
                self.stylesheets.append(urljoin(self.base_url, href))
        elif tag.lower() == "script":
            src = attr_map.get("src")
            if src:
                self.scripts.append(urljoin(self.base_url, src))
        elif tag.lower() == "img":
            alt = attr_map.get("alt", "")
            src = attr_map.get("src", "")
            if alt:
                self.images.append(f"alt={alt}")
            elif src:
                self.images.append(urljoin(self.base_url, src))

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False
        self._current_tag = ""

    def handle_data(self, data: str) -> None:
        text = re.sub(r"\s+", " ", data).strip()
        if not text:
            return
        if self._in_title:
            self.title += text
            return
        if self._current_tag in {"h1", "h2", "h3", "p", "a", "button", "li"} and len(text) > 2:
            self.text_chunks.append(text)


def print_block(label: str, content: str) -> None:
    print(f"\n[{label}]")
    print(content)


def ensure_inside_workspace(path: str) -> Path:
    target = (WORKSPACE / path).resolve()
    if target != WORKSPACE and WORKSPACE not in target.parents:
        raise ValueError("Path is outside the project workspace.")
    return target


def create_directory(path: str) -> ToolResult:
    target = ensure_inside_workspace(path)
    target.mkdir(parents=True, exist_ok=True)
    return ToolResult(True, f"Created directory: {target.relative_to(WORKSPACE)}")


def write_file(path: str, content: str) -> ToolResult:
    target = ensure_inside_workspace(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return ToolResult(True, f"Wrote file: {target.relative_to(WORKSPACE)}")


def read_file(path: str) -> ToolResult:
    target = ensure_inside_workspace(path)
    if not target.exists() or not target.is_file():
        return ToolResult(False, f"File does not exist: {path}")
    return ToolResult(True, target.read_text(encoding="utf-8"))


def list_files(path: str = ".") -> ToolResult:
    target = ensure_inside_workspace(path)
    if not target.exists():
        return ToolResult(False, f"Path does not exist: {path}")
    files = []
    for item in sorted(target.rglob("*")):
        if item.is_file() and "venv" not in item.parts:
            files.append(str(item.relative_to(WORKSPACE)))
    return ToolResult(True, "\n".join(files) if files else "No files found.")


def website_files_exist(path: str) -> bool:
    target = ensure_inside_workspace(path)
    return all((target / name).is_file() for name in ("index.html", "styles.css", "script.js"))


def safe_slug(value: str, fallback: str = "site") -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip("-._").lower()
    return slug or fallback


def fetch_text(session: requests.Session, url: str) -> str:
    response = session.get(url, timeout=20)
    response.raise_for_status()
    response.encoding = response.encoding or response.apparent_encoding or "utf-8"
    return response.text


def normalize_url(url: str) -> str:
    parsed = urlparse(url if re.match(r"^https?://", url, re.IGNORECASE) else f"https://{url}")
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Please provide a valid http or https URL.")
    return parsed.geturl()


def extract_colors(text: str, limit: int = 18) -> list[str]:
    colors = re.findall(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)", text)
    unique = []
    for color in colors:
        if color not in unique:
            unique.append(color)
        if len(unique) >= limit:
            break
    return unique


def analyze_website(url: str) -> tuple[dict[str, Any] | None, ToolResult]:
    try:
        normalized_url = normalize_url(url)
    except ValueError as exc:
        return None, ToolResult(False, str(exc))

    parsed = urlparse(normalized_url)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    try:
        html = fetch_text(session, normalized_url)
    except Exception as exc:
        return None, ToolResult(False, f"Could not fetch page HTML: {exc}")

    parser = PageParser(normalized_url)
    parser.feed(html)

    css_samples = []
    for stylesheet in parser.stylesheets[:6]:
        try:
            css_samples.append(fetch_text(session, stylesheet)[:5000])
        except Exception:
            continue

    combined_css = "\n".join(css_samples)
    text_samples = []
    for chunk in parser.text_chunks:
        if chunk not in text_samples:
            text_samples.append(chunk)
        if len(text_samples) >= 45:
            break

    context = {
        "source_url": normalized_url,
        "domain": parsed.netloc,
        "title": parser.title.strip(),
        "description": parser.description.strip(),
        "text_samples": text_samples,
        "image_hints": parser.images[:12],
        "stylesheet_count": len(parser.stylesheets),
        "script_count": len(parser.scripts),
        "colors": extract_colors(combined_css),
        "css_sample": combined_css[:9000],
    }
    summary = [
        f"Analyzed: {normalized_url}",
        f"Title: {context['title'] or '(none found)'}",
        f"Text samples: {len(text_samples)}",
        f"Stylesheets inspected: {len(css_samples)} of {len(parser.stylesheets)}",
    ]
    return context, ToolResult(True, "\n".join(summary))


TOOLS = {
    "create_directory": create_directory,
    "write_file": write_file,
    "read_file": read_file,
    "list_files": list_files,
    "analyze_website": lambda url: analyze_website(url)[1],
}


SYSTEM_PROMPT = """
You are a terminal-based AI coding agent.

You must follow this loop:
INPUT -> THINK -> TOOL -> OBSERVE -> THINK -> TOOL -> OBSERVE -> OUTPUT

The user wants real project files, not only advice. Work one small action at a time.
Use tools to create folders, write files, list files, and analyze public website design signals.
Do not claim a file exists until a tool observation confirms it.

Available tools:
1. create_directory(path: string)
2. write_file(path: string, content: string)
3. read_file(path: string)
4. list_files(path: string)
5. analyze_website(url: string)

Return exactly one JSON object per response. No markdown fences.

JSON shape:
{
  "step": "START | THINK | TOOL | OUTPUT",
  "content": "short explanation",
  "tool_name": "tool name when step is TOOL",
  "tool_args": { "url": "https://example.com" }
}

Rules:
- START is used once at the beginning of a user task.
- THINK explains the next small action.
- TOOL calls exactly one tool.
- OUTPUT is the final answer for the user.
- If the user provides a URL and asks to clone/scrape/rebuild a website,
  use analyze_website first, then create an original inspired implementation.
- Do not mirror downloaded assets as the final answer. Rebuild the page using
  your own HTML, CSS, and JavaScript based on the public design signals.
- Only analyze public HTML/CSS and rebuild those and try to generate as close to original provided website as possible
"""


def extract_url(text: str) -> str | None:
    match = re.search(r"https?://[^\s\"'<>]+", text, flags=re.IGNORECASE)
    if match:
        return match.group(0).rstrip(".,)")

    bare = re.search(r"\b(?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:/[^\s\"'<>]*)?", text)
    if bare:
        return bare.group(0).rstrip(".,)")
    return None


def is_scrape_request(user_input: str) -> bool:
    return extract_url(user_input) is not None


def build_generation_prompt(context: dict[str, Any]) -> str:
    return f"""
You are rebuilding a website from public design research. Create an original,
browser-openable static implementation inspired by the analyzed site. Do not copy
the original HTML verbatim and do not hotlink original CSS/JS. Use your own
HTML, CSS, and JavaScript and as close as original website.

Source design context:
{json.dumps(context, indent=2)}

Return exactly this JSON shape:
{{
  "files": [
    {{"path": "index.html", "content": "..."}},
    {{"path": "styles.css", "content": "..."}},
    {{"path": "script.js", "content": "..."}}
  ]
}}

Requirements:
- Make a polished page that resembles closly to the source's structure, visual tone,
  typography scale, color direction, and content hierarchy.
- Include a header, hero section, meaningful body sections, and footer.
- Keep all CSS and JavaScript local.
- Use semantic HTML and responsive CSS.
- Do not include markdown fences.
"""


def generate_inspired_files(
    client: genai.Client,
    model: str,
    context: dict[str, Any],
    output_dir: str,
) -> ToolResult:
    prompt = build_generation_prompt(context)
    try:
        raw_text, _ = generate_content_with_fallback(client, model, prompt)
        parsed = extract_json(raw_text)
    except Exception as exc:
        return ToolResult(False, f"Could not generate inspired files: {exc}")

    files = parsed.get("files")
    if not isinstance(files, list) or not files:
        return ToolResult(False, "Model response did not include a files array.")

    written = []
    for file_item in files:
        if not isinstance(file_item, dict):
            continue
        relative_path = str(file_item.get("path", "")).replace("\\", "/").lstrip("/")
        content = str(file_item.get("content", ""))
        if relative_path not in {"index.html", "styles.css", "script.js"}:
            continue
        result = write_file(f"{output_dir}/{relative_path}", content)
        if result.ok:
            written.append(relative_path)

    write_file(f"{output_dir}/design-brief.json", json.dumps(context, indent=2))
    if {"index.html", "styles.css", "script.js"}.issubset(set(written)):
        return ToolResult(True, f"Generated inspired files: {', '.join(written)}")
    return ToolResult(False, f"Generated incomplete files: {', '.join(written) or 'none'}")


def build_improvement_prompt(instruction: str, output_dir: str, files: dict[str, str]) -> str:
    return f"""
You are improving an existing generated website. Modify the current local files
according to the user's request while preserving a complete working static site.

User request:
{instruction}

Project folder:
{output_dir}

Current files:
{json.dumps(files, indent=2)}

Return exactly this JSON shape:
{{
  "summary": "short summary of the improvement",
  "files": [
    {{"path": "index.html", "content": "..."}},
    {{"path": "styles.css", "content": "..."}},
    {{"path": "script.js", "content": "..."}}
  ]
}}

Rules:
- Return full replacement content for all three files.
- Keep links local: index.html should reference styles.css and script.js.
- Improve visual quality, responsiveness, accessibility, and interaction when relevant.
- Do not include markdown fences.
"""


def improve_existing_site(
    client: genai.Client,
    model: str,
    instruction: str,
    output_dir: str,
) -> ToolResult:
    if not website_files_exist(output_dir):
        return ToolResult(False, f"{output_dir} must contain index.html, styles.css, and script.js.")

    files = {}
    for name in ("index.html", "styles.css", "script.js"):
        result = read_file(f"{output_dir}/{name}")
        if not result.ok:
            return result
        files[name] = result.content

    prompt = build_improvement_prompt(instruction, output_dir, files)
    try:
        raw_text, _ = generate_content_with_fallback(client, model, prompt)
        parsed = extract_json(raw_text)
    except Exception as exc:
        return ToolResult(False, f"Could not generate improvements: {exc}")

    changed = []
    generated_files = parsed.get("files")
    if not isinstance(generated_files, list):
        return ToolResult(False, "Model response did not include a files array.")

    for file_item in generated_files:
        if not isinstance(file_item, dict):
            continue
        relative_path = str(file_item.get("path", "")).replace("\\", "/").lstrip("/")
        if relative_path not in {"index.html", "styles.css", "script.js"}:
            continue
        content = str(file_item.get("content", ""))
        result = write_file(f"{output_dir}/{relative_path}", content)
        if result.ok:
            changed.append(relative_path)

    summary = str(parsed.get("summary", "Improved generated website."))
    if {"index.html", "styles.css", "script.js"}.issubset(set(changed)):
        return ToolResult(True, f"{summary}\nUpdated files: {', '.join(changed)}")
    return ToolResult(False, f"Improvement was incomplete. Updated files: {', '.join(changed) or 'none'}")


def run_url_scrape_workflow(
    client: genai.Client | None,
    model: str,
    user_input: str,
    history: list[dict[str, str]],
    state: dict[str, str],
) -> None:
    url = extract_url(user_input)
    if not url:
        print_block("OUTPUT", "Please provide a URL, for example: clone https://www.scaler.com")
        return

    print_block("START", f"I will analyze {url}, then rebuild an original inspired static page.")
    print_block("THINK", "First I need to fetch public page signals: title, text hierarchy, colors, and CSS clues.")
    print_block("TOOL", f"Calling analyze_website for {url}.")
    context, result = analyze_website(url)
    print_block("OBSERVE", result.content)
    if not result.ok:
        print_block("OUTPUT", "The analysis did not complete. Check the URL, your network connection, or whether the site blocks automated requests.")
        history.append({"role": "assistant", "content": "The analysis did not complete."})
        return

    if client is None:
        print_block("OUTPUT", "I analyzed the page, but GEMINI_API_KEY is required to rebuild an inspired version from those signals.")
        history.append({"role": "assistant", "content": "GEMINI_API_KEY is required for generation."})
        return

    parsed = urlparse(context["source_url"])
    output_dir = f"generated_sites/{safe_slug(parsed.netloc)}"
    print_block("THINK", "Now I will ask the model to create fresh local HTML, CSS, and JavaScript from the design brief.")
    print_block("TOOL", f"Calling generate_inspired_files for {output_dir}.")
    generation = generate_inspired_files(client, model, context, output_dir)
    print_block("OBSERVE", generation.content)
    if not generation.ok:
        print_block("OUTPUT", "The rebuild did not complete. Try again or use a lighter model.")
        history.append({"role": "assistant", "content": "The rebuild did not complete."})
        return

    print_block("THINK", "Now I will list the output folder to verify the generated files.")
    print_block("TOOL", f"Calling list_files for {output_dir}.")
    listing = list_files(output_dir)
    print_block("OBSERVE", listing.content)

    output = (
        f"Done. Open {output_dir}/index.html in a browser. "
        "This is an original inspired rebuild based on public design signals, not a direct asset mirror."
    )
    state["last_output_dir"] = output_dir
    print_block("OUTPUT", output)
    history.append({"role": "assistant", "content": output})


def is_improvement_request(user_input: str) -> bool:
    lowered = user_input.lower()
    keywords = (
        "improve",
        "update",
        "modify",
        "change",
        "make it",
        "add ",
        "remove ",
        "fix",
        "enhance",
        "better",
        "responsive",
        "animation",
        "dark",
        "mobile",
    )
    return any(keyword in lowered for keyword in keywords)


def find_latest_generated_site() -> str | None:
    root = ensure_inside_workspace("generated_sites")
    if not root.exists():
        return None
    candidates = [item for item in root.iterdir() if item.is_dir() and website_files_exist(str(item.relative_to(WORKSPACE)))]
    if not candidates:
        return None
    newest = max(candidates, key=lambda item: item.stat().st_mtime)
    return str(newest.relative_to(WORKSPACE))


def run_improvement_workflow(
    client: genai.Client | None,
    model: str,
    user_input: str,
    history: list[dict[str, str]],
    state: dict[str, str],
    target_dir: str | None = None,
) -> bool:
    output_dir = target_dir or state.get("last_output_dir") or find_latest_generated_site()
    if not output_dir or not is_improvement_request(user_input):
        return False

    print_block("START", f"I will improve the existing generated website in {output_dir}.")
    if client is None:
        print_block("OUTPUT", "GEMINI_API_KEY is required to improve existing generated files.")
        return True

    print_block("THINK", "First I need to read the current HTML, CSS, and JavaScript files.")
    print_block("TOOL", f"Reading index.html, styles.css, and script.js from {output_dir}.")
    if not website_files_exist(output_dir):
        print_block("OBSERVE", f"{output_dir} does not contain index.html, styles.css, and script.js.")
        print_block("OUTPUT", "Generate a site first, or pass --target generated_sites/<domain>.")
        return True
    print_block("OBSERVE", "Found index.html, styles.css, and script.js.")

    print_block("THINK", "Now I will ask the model for improved full replacements and write them back.")
    print_block("TOOL", f"Calling improve_existing_site for {output_dir}.")
    result = improve_existing_site(client, model, user_input, output_dir)
    print_block("OBSERVE", result.content)
    if not result.ok:
        print_block("OUTPUT", "The improvement did not complete.")
        return True

    print_block("THINK", "I will list the folder to verify the updated files are still present.")
    print_block("TOOL", f"Calling list_files for {output_dir}.")
    listing = list_files(output_dir)
    print_block("OBSERVE", listing.content)
    output = f"Done. Reopen {output_dir}/index.html to see the improved version."
    print_block("OUTPUT", output)
    state["last_output_dir"] = output_dir
    history.append({"role": "assistant", "content": output})
    return True


def extract_json(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


def generate_content_with_fallback(client: genai.Client, model: str, prompt: str) -> tuple[str, str]:
    models_to_try = [model, *(item for item in FALLBACK_MODELS if item != model)]
    last_error = ""

    for candidate in models_to_try:
        for attempt in range(2):
            try:
                response = client.models.generate_content(
                    model=candidate,
                    contents=prompt,
                    config=types.GenerateContentConfig(response_mime_type="application/json"),
                )
                return response.text or "", candidate
            except Exception as exc:
                last_error = str(exc)
                if attempt == 0:
                    time.sleep(1.5)

        print_block("OBSERVE", f"Model {candidate} was unavailable. Trying another model if possible.")

    raise RuntimeError(f"All configured Gemini models failed. Last error: {last_error}")


def build_observation(result: ToolResult) -> dict[str, str]:
    return {
        "step": "OBSERVE",
        "content": result.content if result.ok else f"Tool failed: {result.content}",
    }


def call_tool(step: dict[str, Any]) -> ToolResult:
    name = step.get("tool_name", "")
    args = step.get("tool_args", {})
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except json.JSONDecodeError:
            args = {"path": args}
    if name not in TOOLS:
        return ToolResult(False, f"Unknown tool: {name}")
    if not isinstance(args, dict):
        return ToolResult(False, "tool_args must be a JSON object.")

    try:
        if name == "write_file":
            return write_file(str(args.get("path", "")), str(args.get("content", "")))
        if name == "analyze_website":
            return analyze_website(str(args.get("url", "")))[1]
        if name in {"create_directory", "read_file", "list_files"}:
            return TOOLS[name](str(args.get("path", ".")))
    except Exception as exc:
        return ToolResult(False, str(exc))

    return ToolResult(False, f"Tool dispatch failed for {name}.")


def run_agent(
    client: genai.Client | None,
    model: str,
    user_input: str,
    history: list[dict[str, str]],
    state: dict[str, str],
    target_dir: str | None = None,
) -> None:
    history.append({"role": "user", "content": user_input})
    if is_scrape_request(user_input):
        run_url_scrape_workflow(client, model, user_input, history, state)
        return

    if run_improvement_workflow(client, model, user_input, history, state, target_dir):
        return

    if client is None:
        print_block("OUTPUT", "Give me a URL to rebuild, or ask to improve an existing generated site. Add GEMINI_API_KEY for generation.")
        return

    transcript = [{"role": "system", "content": SYSTEM_PROMPT}, *history]

    for _ in range(MAX_AGENT_STEPS):
        prompt = "\n".join(f"{msg['role'].upper()}: {msg['content']}" for msg in transcript)
        try:
            raw_text, active_model = generate_content_with_fallback(client, model, prompt)
            model = active_model
        except Exception as exc:
            print_block("OUTPUT", f"The model call failed: {exc}")
            return

        try:
            step = extract_json(raw_text)
        except Exception:
            observation = {
                "step": "OBSERVE",
                "content": "Invalid response. Return exactly one JSON object with step, content, tool_name, and tool_args.",
            }
            print_block("OBSERVE", observation["content"])
            transcript.append({"role": "developer", "content": json.dumps(observation)})
            continue

        step_name = str(step.get("step", "THINK")).upper()
        content = str(step.get("content", ""))
        print_block(step_name, content)
        transcript.append({"role": "assistant", "content": json.dumps(step)})

        if step_name == "TOOL":
            result = call_tool(step)
            observation = build_observation(result)
            print_block("OBSERVE", observation["content"])
            transcript.append({"role": "developer", "content": json.dumps(observation)})
            continue

        if step_name == "OUTPUT":
            history.append({"role": "assistant", "content": content})
            return

    print_block("OUTPUT", "Stopped after the maximum number of agent steps. Try asking me to continue.")


def parse_args(default_model: str) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Conversational CLI website scraper agent.")
    parser.add_argument(
        "--prompt",
        help="Run one instruction and exit. Without this, the agent starts an interactive chat.",
    )
    parser.add_argument(
        "--model",
        default=default_model,
        help=f"Gemini model to use for non-URL tasks. Default: env GEMINI_MODEL or {DEFAULT_MODEL}.",
    )
    parser.add_argument(
        "--target",
        help="Existing generated site folder to improve, for example generated_sites/www.scaler.com.",
    )
    return parser.parse_args()


def main() -> int:
    load_dotenv()
    args = parse_args(os.getenv("GEMINI_MODEL", DEFAULT_MODEL))

    api_key = os.getenv("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key) if api_key else None
    history: list[dict[str, str]] = []
    state: dict[str, str] = {}
    if args.target:
        state["last_output_dir"] = args.target

    print("AI Agent CLI is ready. Type 'exit' or 'quit' to stop.")
    print("Try: clone https://www.scaler.com")
    print("Then: improve it with better mobile layout and smoother animations")

    if args.prompt:
        run_agent(client, args.model, args.prompt, history, state, args.target)
        return 0

    while True:
        try:
            user_input = input("\nYou > ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye.")
            return 0

        if user_input.lower() in {"exit", "quit"}:
            print("Goodbye.")
            return 0

        if not user_input:
            continue

        run_agent(client, args.model, user_input, history, state)


if __name__ == "__main__":
    raise SystemExit(main())
