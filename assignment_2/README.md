# Assignment 02 - AI Agent CLI Tool

This project is a Python conversational CLI agent that accepts natural language instructions in the terminal and produces real website files.


## Setup

Create a `.env` file:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```
model fallback added, Gemini-2-flash, Gemini-2.5-flash-lite, Gemini-3.1-flash-lite, 

Install dependencies:

```bash
pip install -r requirements.txt
```

## Run

Interactive chat:

```bash
python cli_agent.py
```

Example prompt:

```text
clone https://en.wikipedia.org/wiki/Main_Page
```

After a site is generated, keep chatting to improve those same files:

```text
make it more premium and improve the mobile layout
add smooth scroll animations and stronger CTA buttons
make the hero section closer to the original website
```

One-shot demo command:

```bash
python cli_agent.py --prompt "clone https://en.wikipedia.org/wiki/Main_Page"
```

One-shot improvement command:

```bash
python cli_agent.py --target generated_sites/en.wikipedia.org --prompt "improve the generated website with better spacing, animations, and responsive cards"
```

The output is saved under:

```text
generated_sites/<domain>/index.html
generated_sites/<domain>/styles.css
generated_sites/<domain>/script.js
generated_sites/<domain>/design-brief.json
```

Open the generated page:

```bash
start generated_sites/en.wikipedia.org/index.html
```

On macOS use `open generated_sites/en.wikipedia.org/index.html`; on Linux use `xdg-open generated_sites/www.scaler.com/index.html`.

## Agent Loop

The CLI prints each step:

- `START`
- `THINK`
- `TOOL`
- `OBSERVE`
- `OUTPUT`

The scraper only analyzes public HTML/CSS signals. It does not bypass logins, paywalls, CAPTCHAs, robots restrictions, or private resources. The final files are freshly generated and local, not copied source assets.

For improvement requests, the agent reads the existing generated `index.html`, `styles.css`, and `script.js`, asks Gemini for full revised versions, and writes those files back to the same folder.

## Suggested FLOW

1. Run `python cli_agent.py`.
2. Enter `clone https://en.wikipedia.org/wiki/Main_Page`.
3. Let the terminal show `START`, `THINK`, `TOOL`, and `OBSERVE` steps.
4. Ask: `improve it with better animations and mobile layout`.
5. Open `generated_sites/en.wikipedia.org/index.html` in the browser.
