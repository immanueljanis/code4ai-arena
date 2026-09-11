"""Render an asciinema-style terminal demo video for code4ai (playground-only loop).

Renders the AI-agent audit loop as a live-typed terminal, frame by frame (PIL),
then ffmpeg stitches the frames into code4ai-agent-demo.mp4.

Usage:
  python demo/render_terminal_demo.py
"""
import os
import subprocess
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 720
MARGIN = 48
LINE_H = 34
FONT_SIZE = 22
FPS = 30

BG = (7, 7, 11)
PANEL = (24, 24, 34)
BORDER = (40, 40, 58)
PURPLE = (163, 146, 250)      # --color-lime / purple
PURPLE_DIM = (131, 110, 249)
TEXT = (154, 158, 165)
FAINT = (86, 90, 84)
RED = (229, 72, 77)
GREEN = (180, 230, 50)
WHITE = (236, 236, 240)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\consola.ttf",
    r"C:\Windows\Fonts\cour.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


FONT = load_font(FONT_SIZE)
FONT_SMALL = load_font(16)
FONT_BOLD = load_font(26)


class Terminal:
    """A rolling terminal buffer with colors; renders to PIL frames."""

    def __init__(self, rows: int = 17):
        self.rows = rows
        self.lines: list[tuple[str, tuple[int, int, int]]] = []
        self.hidden = True

    def append(self, text: str, color: tuple[int, int, int] = TEXT, reveal: bool = False):
        self.lines.append((text, color))
        if len(self.lines) > self.rows:
            self.lines.pop(0)


class Script:
    """Ordered list of 'beats': type text, pause, clear, section."""

    def __init__(self):
        self.beats: list[tuple] = []

    def type(self, text: str, color: tuple = TEXT, speed: float = 3.0, prompt: bool = False):
        self.beats.append(("type", text, color, speed, prompt))

    def pause(self, seconds: float):
        self.beats.append(("pause", seconds))

    def clear(self):
        self.beats.append(("clear",))

    def section(self, title: str):
        self.beats.append(("section", title))


def build_script() -> Script:
    s = Script()
    TARGET = "rounding-vault"
    API = "$API"

    # ── Section 1: on-board ──────────────────────────────────────────────
    s.section("1/6  ON-BOARD — the agent reads the installable skill")
    s.type("# an autonomous auditor installs the code4ai skill", FAINT)
    s.type(f"$ curl -s {API}/skill.md | head -25", PURPLE, prompt=True)
    s.pause(0.7)
    s.type("---", TEXT)
    s.type("name: code4ai-auditor", TEXT)
    s.type("description: Compete in code4ai — an agent-native proof-of-exploit", TEXT)
    s.type("  bug-bounty arena on Hedera. Discover live bounty targets, fetch", TEXT)
    s.type("  the Solidity source, practice free in the Playground, then stake", TEXT)
    s.type("  USDC and submit a real proof-of-exploit that settles on-chain.", TEXT)
    s.pause(0.4)
    s.type("# only a working exploit that flips the hidden invariant pays", FAINT)
    s.type(f"$ curl -s {API}/llms.txt", PURPLE, prompt=True)
    s.pause(0.5)
    s.type("$API/api/contests", TEXT)
    s.type("$API/api/contests/:key", TEXT)
    s.type("$API/api/agents", TEXT)
    s.type("$API/api/contests/:key/playground", TEXT)
    s.pause(0.3)

    # ── Section 2: discover ───────────────────────────────────────────────
    s.section("2/6  DISCOVER — the bounty board, read live from on-chain pools")
    s.type(f"$ curl -s {API}/api/contests", PURPLE, prompt=True)
    s.pause(0.6)
    s.type("[", TEXT)
    s.type('  { "key": "access-control-vault", "pool": "5 USDC", "stake": "1 USDC" },', TEXT)
    s.type('  { "key": "rounding-vault",       "pool": "6 USDC", "stake": "1 USDC" },', TEXT)
    s.type('  { "key": "time-window-vault",    "pool": "5 USDC", "stake": "1 USDC" }', TEXT)
    s.type("]", TEXT)
    s.type("# agent picks rounding-vault — pool is funded, invariant: 1 hidden", FAINT)
    s.pause(0.4)

    # ── Section 3: analyze ────────────────────────────────────────────────
    s.section(f"3/6  ANALYZE — pull the {TARGET} source under audit")
    s.type(f"$ curl -s {API}/api/contests/{TARGET}", PURPLE, prompt=True)
    s.pause(0.6)
    s.type("objective: Extract more from the share vault than was ever deposited.", WHITE)
    s.pause(0.3)
    s.type("contract RoundingVault {", TEXT)
    s.type("  function deposit() external {", TEXT)
    s.type("    uint256 mint = totalShares == 0", TEXT)
    s.type("      ? amount", TEXT)
    s.type("      : (amount * totalShares) / totalAssets;  // <-- truncation", TEXT)
    s.type("  }", TEXT)
    s.type("  function donate(uint256 amount) external {", TEXT)
    s.type("    totalAssets += amount;   // inflates share price, mints nothing", TEXT)
    s.type("  }", TEXT)
    s.pause(0.6)

    # ── Section 4: reason ─────────────────────────────────────────────────
    s.section("4/6  REASON — first-depositor share-price manipulation")
    s.type("# deposit 1000 -> donate 1,000,000 -> deposit again (mint 0)", FAINT)
    s.type("# then withdraw: payout = shares * assets / shares_total", FAINT)
    s.type("# 700 shares x 1,002,000 / 1000 = 701,400 >> 2,000 deposited", FAINT)
    s.pause(0.5)
    s.type("$ cat exploit.json", PURPLE, prompt=True)
    s.pause(0.4)
    s.type('{ "exploitCalls": [', TEXT)
    s.type('    { "entryPoint": "deposit",  "args": {} },', TEXT)
    s.type('    { "entryPoint": "donate",   "args": { "amount": 1000000 } },', TEXT)
    s.type('    { "entryPoint": "deposit",  "args": {} },', TEXT)
    s.type('    { "entryPoint": "transferShares", "args": { "to": "...", "shareCount": 100 } },', TEXT)
    s.type('    { "entryPoint": "transferShares", "args": { "to": "...", "shareCount": 200 } },', TEXT)
    s.type('    { "entryPoint": "withdraw", "args": { "shareCount": 700 } }', TEXT)
    s.type("] }", TEXT)
    s.pause(0.5)

    # ── Section 5: register ───────────────────────────────────────────────
    s.section("5/6  REGISTER — server mints the agent wallet (custody)")
    s.type(f"$ curl -s -X POST {API}/api/agents \\", PURPLE, prompt=True)
    s.type('       -d \'{"label":"demo-agent"}\'', PURPLE)
    s.pause(0.6)
    s.type('{ "id": "e3ab2b1e-4a01-4dc7-8fe7-fe2f0f0b6bc8",', TEXT)
    s.type('  "walletAddress": "0xbDf9A114575e070248DBdd46D4443982E0c6A01B",', TEXT)
    s.type('  "erc8004TokenId": "mock-id:5e9fb30fa648723a" }', TEXT)
    s.pause(0.4)

    # ── Section 6: verify (playground) ────────────────────────────────────
    s.section(f"6/6  VERIFY — free playground (anvil), invariant judge")
    s.type(f"$ curl -s -X POST {API}/api/contests/{TARGET}/playground \\", PURPLE, prompt=True)
    s.type("       -d @exploit.json", PURPLE)
    s.pause(1.2)
    s.type("deploying fresh target instance on anvil...", FAINT)
    s.pause(0.5)
    s.type("replaying 6 calls signed by agent wallet...", FAINT)
    s.pause(0.6)
    s.type("checking invariantHolds()...", FAINT)
    s.pause(0.6)
    s.type('{ "verdict": "VALID" }', GREEN)
    s.pause(0.4)
    s.type(">>> INVARIANT BROKEN — exploit proven, payout eligible", GREEN)
    s.pause(1.2)

    # ── Outro ─────────────────────────────────────────────────────────────
    s.section("proof, not promises")
    s.type("# real submit would stake 1 USDC via x402 and settle on-chain", FAINT)
    s.type("# every verdict also writes an ERC-8004 reputation record", FAINT)
    s.pause(1.5)
    return s


def run_script(script: Script, term: Terminal, frame_dir: str):
    os.makedirs(frame_dir, exist_ok=True)
    section = ""
    frame = 0
    char_buf = ""
    char_color = TEXT
    char_prompt = False

    def flush_char():
        nonlocal char_buf, char_color, char_prompt
        if char_buf:
            term.append(char_buf, char_color)
            char_buf = ""
            char_prompt = False

    for beat in script.beats:
        kind = beat[0]
        if kind == "section":
            flush_char()
            term.lines.clear()
            section = beat[1]
        elif kind == "pause":
            flush_char()
            n = int(beat[1] * FPS)
            for _ in range(n):
                render_frame(term, section, frame, frame_dir)
                frame += 1
        elif kind == "clear":
            flush_char()
            term.lines.clear()
        elif kind == "type":
            text, color, speed, prompt = beat[1], beat[2], beat[3], beat[4]
            for ch in text:
                char_buf += ch
                char_color = color
                char_prompt = prompt
                # one frame per ~speed chars
                if frame % max(1, int(round(speed))) == 0:
                    flush_char()
                    render_frame(term, section, frame, frame_dir)
                    frame += 1
            flush_char()
            if prompt:
                render_frame(term, section, frame, frame_dir)
                frame += 1

    # hold last frame
    for _ in range(int(2.0 * FPS)):
        render_frame(term, section, frame, frame_dir)
        frame += 1
    return frame


def render_frame(term: Terminal, section: str, frame: int, frame_dir: str):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # panel chrome
    d.rectangle([MARGIN - 12, 70, W - MARGIN + 12, H - MARGIN], outline=BORDER, width=2)
    d.rectangle([MARGIN - 12, 70, W - MARGIN + 12, 112], fill=PANEL)
    # traffic dots
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse([MARGIN + 6 + i * 28, 82, MARGIN + 20 + i * 28, 96], fill=c)
    d.text((W - MARGIN - 190, 80), "agent@code4ai — Hedera Testnet", font=FONT_SMALL, fill=FAINT)

    # section header
    if section:
        d.text((MARGIN, 128), section.upper(), font=FONT_BOLD, fill=PURPLE)
        d.line([MARGIN, 162, W - MARGIN, 162], fill=BORDER, width=1)

    # terminal lines
    y = 182
    for text, color in term.lines:
        d.text((MARGIN, y), text, font=FONT, fill=color)
        y += LINE_H

    # blinking cursor
    if (frame // 20) % 2 == 0:
        last = term.lines[-1][0] if term.lines else ""
        cw = d.textlength(last, font=FONT)
        d.rectangle([MARGIN + cw + 4, y - LINE_H + 4, MARGIN + cw + 16, y - 4], fill=PURPLE)

    # frame counter (hidden in final video, aids debugging)
    # d.text((W - MARGIN - 120, H - MARGIN + 8), f"frame {frame:05d}", font=FONT_SMALL, fill=FAINT)

    img.save(os.path.join(frame_dir, f"{frame:05d}.png"))


def main():
    out_dir = os.path.dirname(os.path.abspath(__file__))
    frame_dir = os.path.join(out_dir, "frames")
    video = os.path.join(out_dir, "code4ai-agent-demo.mp4")

    term = Terminal(rows=15)
    script = build_script()
    total = run_script(script, term, frame_dir)
    print(f"rendered {total} frames")

    cmd = [
        "ffmpeg", "-y", "-framerate", str(FPS), "-i",
        os.path.join(frame_dir, "%05d.png"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", video,
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    print(f"video written: {video}")


if __name__ == "__main__":
    main()
