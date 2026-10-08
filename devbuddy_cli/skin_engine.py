"""Hermes skin/theme engine — the theme SDK for every surface."""

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from devbuddy_constants import get_hermes_home

logger = logging.getLogger(__name__)


@dataclass
class SkinConfig:
    """Complete skin configuration."""
    name: str
    description: str = ""
    colors: Dict[str, str] = field(default_factory=dict)
    # Paired palettes for the opposite background polarity (mirrors the desktop app's
    # colors/darkColors pairing): a light terminal prefers `light_colors` (falling back to
    # `colors`), and vice versa for `dark_colors`.
    light_colors: Dict[str, str] = field(default_factory=dict)
    dark_colors: Dict[str, str] = field(default_factory=dict)
    spinner: Dict[str, Any] = field(default_factory=dict)
    branding: Dict[str, str] = field(default_factory=dict)
    tool_prefix: str = "┊"
    tool_emojis: Dict[str, str] = field(default_factory=dict)  # per-tool emoji overrides
    banner_logo: str = ""    # Rich-markup ASCII art logo (replaces HERMES_AGENT_LOGO)
    banner_hero: str = ""    # Rich-markup hero art (replaces HERMES_CADUCEUS)

    def get_color(self, key: str, fallback: str = "") -> str:
        return self.colors.get(key, fallback)

    def get_branding(self, key: str, fallback: str = "") -> str:
        return self.branding.get(key, fallback)

    def get_spinner_wings(self) -> List[Tuple[str, str]]:
        """Spinner wing pairs, or empty list if none."""
        return [(str(pair[0]), str(pair[1])) for pair in self.spinner.get("wings", [])
                if isinstance(pair, (list, tuple)) and len(pair) == 2]


def _branding(who: str, symbol: str, goodbye: str, prompt: str = "", help_header: str = "") -> Dict[str, str]:
    """Branding block for a "<who> Agent" persona keyed by its glyph."""
    return {
        "agent_name": f"{who} Agent",
        "welcome": f"Welcome to {who} Agent! Type your message or /help for commands.",
        "goodbye": goodbye, "response_label": f" {symbol} {who} ", "prompt_symbol": prompt or symbol,
        "help_header": help_header or f"({symbol}) Available Commands"}


def _wings(*glyphs) -> List[List[str]]:
    """Spinner wing pairs `⟪g` / `g⟫`; a (left, right) tuple gives asymmetric glyphs."""
    return [[f"⟪{g[0] if isinstance(g, tuple) else g}", f"{g[1] if isinstance(g, tuple) else g}⟫"]
            for g in glyphs]


# Branding shared by every Hermes-named built-in (mono/daylight override help_header).
_HERMES_BRANDING: Dict[str, str] = _branding(
    "Hermes", "☤", "Goodbye! ☤", prompt="❯", help_header="(^_^)? Available Commands")

_BUILTIN_SKINS: Dict[str, Dict[str, Any]] = {
    "default": {
        "name": "default", "description": "Classic Hermes — gold and kawaii",
        # Dark-authored; values match the TUI's DARK_THEME so both render the same gold.
        "colors": {
            "banner_border": "#CD7F32", "banner_title": "#FFD700", "banner_accent": "#FFBF00",
            "banner_dim": "#B8860B", "banner_text": "#FFF8DC", "ui_accent": "#FFBF00",
            "ui_label": "#DAA520", "ui_ok": "#4caf50", "ui_error": "#ef5350", "ui_warn": "#ffa726",
            "prompt": "#FFF8DC", "input_rule": "#CD7F32", "response_border": "#FFD700",
            "status_bar_bg": "#1a1a2e", "status_bar_text": "#C0C0C0",
            "status_bar_strong": "#FFD700", "status_bar_dim": "#8A7A4A",
            "status_bar_good": "#8FBC8F", "status_bar_warn": "#FFD700", "status_bar_bad": "#FF8C00",
            "status_bar_critical": "#FF6B6B", "session_label": "#DAA520",
            "session_border": "#8B8682", "completion_menu_bg": "#1a1a2e",
            "completion_menu_current_bg": "#333355", "selection_bg": "#3a3a55",
            "shell_dollar": "#4dabf7", "voice_status_bg": "#1a1a2e"},
        # Light overlay (merged onto `colors`). Goldenrod ladder: on white the vivid
        # #FFD700/#FFBF00 read as glare and WCAG-darkened mustard (#867000) as mud; the
        # statusbar's goldenrod family (#B8860B/#DAA520) keeps the hue, tames saturation.
        # Hierarchy on white: ink body 8.9:1 > fade 5.2 > label 3.7 > muted 3.3 > title 2.7 >
        # headers 2.4. Fills (*_bg) flip the dark navy surfaces to light polarity.
        "light_colors": {
            "banner_title": "#C8961E", "banner_accent": "#D89B04", "banner_dim": "#B8860B",
            "banner_text": "#5C4718", "ui_accent": "#D89B04", "ui_label": "#A97E10",
            "ui_ok": "#2E7D32", "ui_error": "#C62828", "ui_warn": "#D97706", "prompt": "#5C4718",
            "response_border": "#C8961E", "session_label": "#A97E10", "status_bar_text": "#6F6F6F",
            "status_bar_strong": "#C8961E", "status_bar_dim": "#9A8A5A",
            "status_bar_good": "#2E7D32", "status_bar_warn": "#C8961E", "status_bar_bad": "#C2410C",
            "status_bar_critical": "#B91C1C", "shell_dollar": "#1E6FC0",
            "completion_menu_bg": "#F5F5F5", "completion_menu_current_bg": "#E0D1BF",
            "selection_bg": "#D4E4F7", "status_bar_bg": "#F5F5F5", "voice_status_bg": "#F5F5F5"},
        "spinner": {},  # empty = hardcoded defaults in display.py
        "branding": _HERMES_BRANDING,
        "tool_prefix": "┊"},
    "ares": {
        "name": "ares", "description": "War-god theme — crimson and bronze",
        "colors": {
            "banner_border": "#A93333", "banner_title": "#C7A96B", "banner_accent": "#DD4A3A",
            "banner_dim": "#905151", "banner_text": "#F1E6CF", "ui_accent": "#DD4A3A",
            "ui_label": "#C7A96B", "ui_ok": "#4caf50", "ui_error": "#ef5350", "ui_warn": "#ffa726",
            "prompt": "#F1E6CF", "input_rule": "#A93333", "response_border": "#C7A96B",
            "status_bar_bg": "#2A1212", "status_bar_text": "#F1E6CF",
            "status_bar_strong": "#C7A96B", "status_bar_dim": "#756054",
            "status_bar_good": "#7BC96F", "status_bar_warn": "#C7A96B", "status_bar_bad": "#DD4A3A",
            "status_bar_critical": "#EF5350", "session_label": "#C7A96B",
            "session_border": "#6E584B", "completion_menu_bg": "#2A1212",
            "completion_menu_current_bg": "#5C221D", "selection_bg": "#692620",
            "shell_dollar": "#DD4A3A", "voice_status_bg": "#2A1212"},
        "spinner": {
            "waiting_faces": ["(⚔)", "(⛨)", "(▲)", "(<>)", "(/)"],
            "thinking_faces": ["(⚔)", "(⛨)", "(▲)", "(⌁)", "(<>)"],
            "thinking_verbs": [
                "forging", "marching", "sizing the field", "holding the line",
                "hammering plans", "tempering steel", "plotting impact", "raising the shield"],
            "wings": _wings("⚔", "▲", ("╸", "╺"), "⛨")},
        "branding": _branding("Ares", "⚔", "Farewell, warrior! ⚔"),
        "tool_prefix": "╎",
        "banner_logo": """[bold #A3261F] █████╗ ██████╗ ███████╗███████╗       █████╗  ██████╗ ███████╗███╗   ██╗████████╗[/]
[bold #B73122]██╔══██╗██╔══██╗██╔════╝██╔════╝      ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝[/]
[#C93C24]███████║██████╔╝█████╗  ███████╗█████╗███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║[/]
[#D84A28]██╔══██║██╔══██╗██╔══╝  ╚════██║╚════╝██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║[/]
[#E15A2D]██║  ██║██║  ██║███████╗███████║      ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║[/]
[#EB6C32]╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝      ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝[/]""",
        "banner_hero": """[#9F1C1C]⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣤⣤⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#9F1C1C]⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⠟⠻⣿⣦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#C7A96B]⠀⠀⠀⠀⠀⠀⠀⣠⣾⡿⠋⠀⠀⠀⠙⢿⣷⣄⠀⠀⠀⠀⠀⠀⠀[/]
[#C7A96B]⠀⠀⠀⠀⠀⢀⣾⡿⠋⠀⠀⢠⡄⠀⠀⠙⢿⣷⡀⠀⠀⠀⠀⠀[/]
[#DD4A3A]⠀⠀⠀⠀⣰⣿⠟⠀⠀⠀⣰⣿⣿⣆⠀⠀⠀⠻⣿⣆⠀⠀⠀⠀[/]
[#DD4A3A]⠀⠀⠀⢰⣿⠏⠀⠀⢀⣾⡿⠉⢿⣷⡀⠀⠀⠹⣿⡆⠀⠀⠀[/]
[#9F1C1C]⠀⠀⠀⣿⡟⠀⠀⣠⣿⠟⠀⠀⠀⠻⣿⣄⠀⠀⢻⣿⠀⠀⠀[/]
[#9F1C1C]⠀⠀⠀⣿⡇⠀⠀⠙⠋⠀⠀⚔⠀⠀⠙⠋⠀⠀⢸⣿⠀⠀⠀[/]
[#6B1717]⠀⠀⠀⢿⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣼⡿⠀⠀⠀[/]
[#6B1717]⠀⠀⠀⠘⢿⣷⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣾⡿⠃⠀⠀⠀[/]
[#C7A96B]⠀⠀⠀⠀⠈⠻⣿⣷⣦⣤⣀⣀⣤⣤⣶⣿⠿⠋⠀⠀⠀⠀[/]
[#C7A96B]⠀⠀⠀⠀⠀⠀⠀⠉⠛⠿⠿⠿⠿⠛⠉⠀⠀⠀⠀⠀⠀⠀[/]
[#DD4A3A]⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⚔⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]
[dim #6B1717]⠀⠀⠀⠀⠀⠀⠀⠀war god online⠀⠀⠀⠀⠀⠀⠀⠀[/]""",
    },
    "mono": {
        "name": "mono", "description": "Monochrome — clean grayscale",
        "colors": {
            "banner_border": "#5E5E5E", "banner_title": "#e6edf3", "banner_accent": "#aaaaaa",
            "banner_dim": "#606060", "banner_text": "#c9d1d9", "ui_accent": "#aaaaaa",
            "ui_label": "#888888", "ui_ok": "#888888", "ui_error": "#cccccc", "ui_warn": "#999999",
            "prompt": "#c9d1d9", "input_rule": "#606060", "response_border": "#aaaaaa",
            "status_bar_bg": "#1F1F1F", "status_bar_text": "#C9D1D9",
            "status_bar_strong": "#E6EDF3", "status_bar_dim": "#777777",
            "status_bar_good": "#B5B5B5", "status_bar_warn": "#AAAAAA", "status_bar_bad": "#D0D0D0",
            "status_bar_critical": "#F0F0F0", "session_label": "#888888",
            "session_border": "#5E5E5E", "completion_menu_bg": "#1F1F1F",
            "completion_menu_current_bg": "#464646", "selection_bg": "#505050",
            "shell_dollar": "#aaaaaa", "voice_status_bg": "#1F1F1F"},
        "spinner": {},
        "branding": {**_HERMES_BRANDING, "help_header": "[?] Available Commands"},
        "tool_prefix": "┊"},
    "slate": {
        "name": "slate", "description": "Cool blue — developer-focused",
        "colors": {
            "banner_border": "#4169e1", "banner_title": "#7eb8f6", "banner_accent": "#8EA8FF",
            "banner_dim": "#545E6B", "banner_text": "#c9d1d9", "ui_accent": "#7eb8f6",
            "ui_label": "#8EA8FF", "ui_ok": "#63D0A6", "ui_error": "#F7A072", "ui_warn": "#e6a855",
            "prompt": "#c9d1d9", "input_rule": "#4169e1", "response_border": "#7eb8f6",
            "status_bar_bg": "#151C2F", "status_bar_text": "#C9D1D9",
            "status_bar_strong": "#7EB8F6", "status_bar_dim": "#5D6672",
            "status_bar_good": "#63D0A6", "status_bar_warn": "#E6A855", "status_bar_bad": "#F7A072",
            "status_bar_critical": "#FF7A7A", "session_label": "#7eb8f6",
            "session_border": "#545E6B", "completion_menu_bg": "#151C2F",
            "completion_menu_current_bg": "#324867", "selection_bg": "#3A5375",
            "shell_dollar": "#7eb8f6", "voice_status_bg": "#151C2F"},
        "spinner": {}, "branding": _HERMES_BRANDING, "tool_prefix": "┊"},
    "daylight": {
        "name": "daylight",
        "description": "Light theme for bright terminals with dark text and cool blue accents",
        "colors": {
            "banner_border": "#2563EB", "banner_title": "#0F172A", "banner_accent": "#1D4ED8",
            "banner_dim": "#475569", "banner_text": "#111827", "ui_accent": "#2563EB",
            "ui_label": "#0F766E", "ui_ok": "#15803D", "ui_error": "#B91C1C", "ui_warn": "#B45309",
            "prompt": "#111827", "input_rule": "#6E94BE", "response_border": "#2563EB",
            "status_bar_bg": "#E5EDF8", "status_bar_text": "#111827",
            "status_bar_strong": "#2563EB", "status_bar_dim": "#838890",
            "status_bar_good": "#15803D", "status_bar_warn": "#B45309", "status_bar_bad": "#B45309",
            "status_bar_critical": "#B91C1C", "session_label": "#1D4ED8",
            "session_border": "#64748B", "completion_menu_bg": "#F8FAFC",
            "completion_menu_current_bg": "#DBEAFE", "completion_menu_meta_bg": "#EEF2FF",
            "completion_menu_meta_current_bg": "#BFDBFE", "selection_bg": "#D3E0FB",
            "shell_dollar": "#2563EB", "voice_status_bg": "#E5EDF8"},
        "spinner": {},
        "branding": {**_HERMES_BRANDING, "help_header": "[?] Available Commands"},
        "tool_prefix": "│"},
    "warm-lightmode": {
        "name": "warm-lightmode",
        "description": "Warm light mode — dark brown/gold text for light terminal backgrounds",
        "colors": {
            "banner_border": "#8B6914", "banner_title": "#5C3D11", "banner_accent": "#8B4513",
            "banner_dim": "#8B7355", "banner_text": "#2C1810", "ui_accent": "#8B4513",
            "ui_label": "#5C3D11", "ui_ok": "#2E7D32", "ui_error": "#C62828", "ui_warn": "#E65100",
            "prompt": "#2C1810", "input_rule": "#8B6914", "response_border": "#8B6914",
            "status_bar_bg": "#F5F0E8", "status_bar_text": "#2C1810",
            "status_bar_strong": "#8B4513", "status_bar_dim": "#8A8F98",
            "status_bar_good": "#2E7D32", "status_bar_warn": "#E65100", "status_bar_bad": "#DA4D00",
            "status_bar_critical": "#C62828", "session_label": "#5C3D11",
            "session_border": "#A0845C", "completion_menu_bg": "#F5EFE0",
            "completion_menu_current_bg": "#E8DCC8", "completion_menu_meta_bg": "#F0E8D8",
            "completion_menu_meta_current_bg": "#DFCFB0", "selection_bg": "#E8DAD0",
            "shell_dollar": "#8B4513", "voice_status_bg": "#F5F0E8"},
        "spinner": {}, "branding": _HERMES_BRANDING, "tool_prefix": "┊"},
    "poseidon": {
        "name": "poseidon", "description": "Ocean-god theme — deep blue and seafoam",
        "colors": {
            "banner_border": "#2A6FB9", "banner_title": "#A9DFFF", "banner_accent": "#5DB8F5",
            "banner_dim": "#44638F", "banner_text": "#EAF7FF", "ui_accent": "#5DB8F5",
            "ui_label": "#A9DFFF", "ui_ok": "#4caf50", "ui_error": "#ef5350", "ui_warn": "#ffa726",
            "prompt": "#EAF7FF", "input_rule": "#2A6FB9", "response_border": "#5DB8F5",
            "status_bar_bg": "#0F2440", "status_bar_text": "#EAF7FF",
            "status_bar_strong": "#A9DFFF", "status_bar_dim": "#52708A",
            "status_bar_good": "#6ED7B0", "status_bar_warn": "#5DB8F5", "status_bar_bad": "#3576BC",
            "status_bar_critical": "#D94F4F", "session_label": "#A9DFFF",
            "session_border": "#496884", "completion_menu_bg": "#0F2440",
            "completion_menu_current_bg": "#254D73", "selection_bg": "#2A587F",
            "shell_dollar": "#5DB8F5", "voice_status_bg": "#0F2440"},
        "spinner": {
            "waiting_faces": ["(≈)", "(Ψ)", "(∿)", "(◌)", "(◠)"],
            "thinking_faces": ["(Ψ)", "(∿)", "(≈)", "(⌁)", "(◌)"],
            "thinking_verbs": [
                "charting currents", "sounding the depth", "reading foam lines",
                "steering the trident", "tracking undertow", "plotting sea lanes",
                "calling the swell", "measuring pressure"],
            "wings": _wings("≈", "Ψ", "∿", "◌")},
        "branding": _branding("Poseidon", "Ψ", "Fair winds! Ψ"),
        "tool_prefix": "│",
        "banner_logo": """[bold #B8E8FF]██████╗  ██████╗ ███████╗███████╗██╗██████╗  ██████╗ ███╗   ██╗       █████╗  ██████╗ ███████╗███╗   ██╗████████╗[/]
[bold #97D6FF]██╔══██╗██╔═══██╗██╔════╝██╔════╝██║██╔══██╗██╔═══██╗████╗  ██║      ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝[/]
[#75C1F6]██████╔╝██║   ██║███████╗█████╗  ██║██║  ██║██║   ██║██╔██╗ ██║█████╗███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║[/]
[#4FA2E0]██╔═══╝ ██║   ██║╚════██║██╔══╝  ██║██║  ██║██║   ██║██║╚██╗██║╚════╝██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║[/]
[#2E7CC7]██║     ╚██████╔╝███████║███████╗██║██████╔╝╚██████╔╝██║ ╚████║      ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║[/]
[#1B4F95]╚═╝      ╚═════╝ ╚══════╝╚══════╝╚═╝╚═════╝  ╚═════╝ ╚═╝  ╚═══╝      ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝[/]""",
        "banner_hero": """[#2A6FB9]⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#5DB8F5]⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣾⣿⣷⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#5DB8F5]⠀⠀⠀⠀⠀⠀⠀⢠⣿⠏⠀Ψ⠀⠹⣿⡄⠀⠀⠀⠀⠀⠀⠀[/]
[#A9DFFF]⠀⠀⠀⠀⠀⠀⠀⣿⡟⠀⠀⠀⠀⠀⢻⣿⠀⠀⠀⠀⠀⠀⠀[/]
[#A9DFFF]⠀⠀⠀≈≈≈≈≈⣿⡇⠀⠀⠀⠀⠀⢸⣿≈≈≈≈≈⠀⠀⠀[/]
[#5DB8F5]⠀⠀⠀⠀⠀⠀⠀⣿⡇⠀⠀⠀⠀⠀⢸⣿⠀⠀⠀⠀⠀⠀⠀[/]
[#2A6FB9]⠀⠀⠀⠀⠀⠀⠀⢿⣧⠀⠀⠀⠀⠀⣼⡿⠀⠀⠀⠀⠀⠀⠀[/]
[#2A6FB9]⠀⠀⠀⠀⠀⠀⠀⠘⢿⣷⣄⣀⣠⣾⡿⠃⠀⠀⠀⠀⠀⠀⠀[/]
[#153C73]⠀⠀⠀⠀⠀⠀⠀⠀⠈⠻⣿⣿⡿⠟⠁⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#153C73]⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#5DB8F5]⠀⠀⠀⠀⠀≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈⠀⠀⠀⠀⠀[/]
[#A9DFFF]⠀⠀⠀⠀⠀⠀≈≈≈≈≈≈≈≈≈≈≈≈≈⠀⠀⠀⠀⠀⠀[/]
[dim #153C73]⠀⠀⠀⠀⠀⠀⠀deep waters hold⠀⠀⠀⠀⠀⠀⠀[/]""",
    },
    "sisyphus": {
        "name": "sisyphus", "description": "Sisyphean theme — austere grayscale with persistence",
        "colors": {
            "banner_border": "#B7B7B7", "banner_title": "#F5F5F5", "banner_accent": "#E7E7E7",
            "banner_dim": "#5C5C5C", "banner_text": "#D3D3D3", "ui_accent": "#E7E7E7",
            "ui_label": "#D3D3D3", "ui_ok": "#919191", "ui_error": "#E7E7E7", "ui_warn": "#B7B7B7",
            "prompt": "#F5F5F5", "input_rule": "#656565", "response_border": "#B7B7B7",
            "status_bar_bg": "#202020", "status_bar_text": "#D3D3D3",
            "status_bar_strong": "#F5F5F5", "status_bar_dim": "#6D6D6D",
            "status_bar_good": "#B7B7B7", "status_bar_warn": "#D3D3D3", "status_bar_bad": "#E7E7E7",
            "status_bar_critical": "#F5F5F5", "session_label": "#919191",
            "session_border": "#656565", "completion_menu_bg": "#202020",
            "completion_menu_current_bg": "#585858", "selection_bg": "#666666",
            "shell_dollar": "#E7E7E7", "voice_status_bg": "#202020"},
        "spinner": {
            "waiting_faces": ["(◉)", "(◌)", "(◬)", "(⬤)", "(::)"],
            "thinking_faces": ["(◉)", "(◬)", "(◌)", "(○)", "(●)"],
            "thinking_verbs": [
                "finding traction", "measuring the grade", "resetting the boulder",
                "counting the ascent", "testing leverage", "setting the shoulder",
                "pushing uphill", "enduring the loop"],
            "wings": _wings("◉", "◬", "◌", "⬤")},
        "branding": _branding("Sisyphus", "◉", "The boulder waits. ◉"),
        "tool_prefix": "│",
        "banner_logo": """[bold #F5F5F5]███████╗██╗███████╗██╗   ██╗██████╗ ██╗  ██╗██╗   ██╗███████╗       █████╗  ██████╗ ███████╗███╗   ██╗████████╗[/]
[bold #E7E7E7]██╔════╝██║██╔════╝╚██╗ ██╔╝██╔══██╗██║  ██║██║   ██║██╔════╝      ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝[/]
[#D7D7D7]███████╗██║███████╗ ╚████╔╝ ██████╔╝███████║██║   ██║███████╗█████╗███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║[/]
[#BFBFBF]╚════██║██║╚════██║  ╚██╔╝  ██╔═══╝ ██╔══██║██║   ██║╚════██║╚════╝██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║[/]
[#8F8F8F]███████║██║███████║   ██║   ██║     ██║  ██║╚██████╔╝███████║      ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║[/]
[#626262]╚══════╝╚═╝╚══════╝   ╚═╝   ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝      ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝[/]""",
        "banner_hero": """[#B7B7B7]⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣀⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#D3D3D3]⠀⠀⠀⠀⠀⠀⠀⣠⣾⣿⣿⣿⣿⣷⣄⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#E7E7E7]⠀⠀⠀⠀⠀⠀⣾⣿⣿⣿⣿⣿⣿⣿⣷⠀⠀⠀⠀⠀⠀⠀[/]
[#F5F5F5]⠀⠀⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠀[/]
[#E7E7E7]⠀⠀⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⠀⠀⠀[/]
[#D3D3D3]⠀⠀⠀⠀⠀⠀⠘⢿⣿⣿⣿⣿⣿⡿⠃⠀⠀⠀⠀⠀⠀⠀[/]
[#B7B7B7]⠀⠀⠀⠀⠀⠀⠀⠀⠙⠿⣿⠿⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#919191]⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#656565]⠀⠀⠀⠀⠀⠀⠀⠀⠀⣰⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#656565]⠀⠀⠀⠀⠀⠀⠀⠀⣰⣿⣿⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#4A4A4A]⠀⠀⠀⠀⠀⠀⠀⣰⣿⣿⣿⣿⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#4A4A4A]⠀⠀⠀⠀⠀⣀⣴⣿⣿⣿⣿⣿⣿⣦⣀⠀⠀⠀⠀⠀⠀[/]
[#656565]⠀⠀⠀━━━━━━━━━━━━━━━━━━━━━━━⠀⠀⠀[/]
[dim #4A4A4A]⠀⠀⠀⠀⠀⠀⠀⠀⠀the boulder⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]""",
    },
    "charizard": {
        "name": "charizard", "description": "Volcanic theme — burnt orange and ember",
        "colors": {
            "banner_border": "#C75B1D", "banner_title": "#FFD39A", "banner_accent": "#F29C38",
            "banner_dim": "#C58A45", "banner_text": "#FFF0D4", "ui_accent": "#F29C38",
            "ui_label": "#FFD39A", "ui_ok": "#4caf50", "ui_error": "#ef5350", "ui_warn": "#ffa726",
            "prompt": "#FFF0D4", "input_rule": "#C75B1D", "response_border": "#F29C38",
            "status_bar_bg": "#2B160E", "status_bar_text": "#FFF0D4",
            "status_bar_strong": "#FFD39A", "status_bar_dim": "#826144",
            "status_bar_good": "#6BCB77", "status_bar_warn": "#F29C38", "status_bar_bad": "#E2832B",
            "status_bar_critical": "#EF5350", "session_label": "#FFD39A",
            "session_border": "#7B593A", "completion_menu_bg": "#0B0503",
            "completion_menu_current_bg": "#4A1B07", "completion_menu_meta_bg": "#120806",
            "completion_menu_meta_current_bg": "#5A260D", "selection_bg": "#5A260D",
            "shell_dollar": "#F29C38", "voice_status_bg": "#2B160E"},
        "spinner": {
            "waiting_faces": ["(✦)", "(▲)", "(◇)", "(<>)", "(🔥)"],
            "thinking_faces": ["(✦)", "(▲)", "(◇)", "(⌁)", "(🔥)"],
            "thinking_verbs": [
                "banking into the draft", "measuring burn", "reading the updraft",
                "tracking ember fall", "setting wing angle", "holding the flame core",
                "plotting a hot landing", "coiling for lift"],
            "wings": _wings("✦", "▲", "◌", "◇")},
        "branding": _branding("Charizard", "✦", "Flame out! ✦"),
        "tool_prefix": "│",
        "banner_logo": """[bold #FFF0D4] ██████╗██╗  ██╗ █████╗ ██████╗ ██╗███████╗ █████╗ ██████╗ ██████╗        █████╗  ██████╗ ███████╗███╗   ██╗████████╗[/]
[bold #FFD39A]██╔════╝██║  ██║██╔══██╗██╔══██╗██║╚══███╔╝██╔══██╗██╔══██╗██╔══██╗      ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝[/]
[#F29C38]██║     ███████║███████║██████╔╝██║  ███╔╝ ███████║██████╔╝██║  ██║█████╗███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║[/]
[#E2832B]██║     ██╔══██║██╔══██║██╔══██╗██║ ███╔╝  ██╔══██║██╔══██╗██║  ██║╚════╝██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║[/]
[#C75B1D]╚██████╗██║  ██║██║  ██║██║  ██║██║███████╗██║  ██║██║  ██║██████╔╝      ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║[/]
[#7A3511] ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝       ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝[/]""",
        "banner_hero": """[#FFD39A]⠀⠀⠀⠀⠀⠀⠀⠀⣀⣤⠶⠶⠶⣤⣀⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#F29C38]⠀⠀⠀⠀⠀⠀⣴⠟⠁⠀⠀⠀⠀⠈⠻⣦⠀⠀⠀⠀⠀⠀[/]
[#F29C38]⠀⠀⠀⠀⠀⣼⠏⠀⠀⠀✦⠀⠀⠀⠀⠹⣧⠀⠀⠀⠀⠀[/]
[#E2832B]⠀⠀⠀⠀⢰⡟⠀⠀⣀⣤⣤⣤⣀⠀⠀⠀⢻⡆⠀⠀⠀⠀[/]
[#E2832B]⠀⠀⣠⡾⠛⠁⣠⣾⠟⠉⠀⠉⠻⣷⣄⠀⠈⠛⢷⣄⠀⠀[/]
[#C75B1D]⠀⣼⠟⠀⢀⣾⠟⠁⠀⠀⠀⠀⠀⠈⠻⣷⡀⠀⠻⣧⠀[/]
[#C75B1D]⢸⡟⠀⠀⣿⡟⠀⠀⠀🔥⠀⠀⠀⠀⢻⣿⠀⠀⢻⡇[/]
[#7A3511]⠀⠻⣦⡀⠘⢿⣧⡀⠀⠀⠀⠀⠀⢀⣼⡿⠃⢀⣴⠟⠀[/]
[#7A3511]⠀⠀⠈⠻⣦⣀⠙⢿⣷⣤⣤⣤⣾⡿⠋⣀⣴⠟⠁⠀⠀[/]
[#C75B1D]⠀⠀⠀⠀⠈⠙⠛⠶⠤⠭⠭⠤⠶⠛⠋⠁⠀⠀⠀⠀[/]
[#F29C38]⠀⠀⠀⠀⠀⠀⠀⠀⣰⡿⢿⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀[/]
[#F29C38]⠀⠀⠀⠀⠀⠀⠀⣼⡟⠀⠀⢻⣧⠀⠀⠀⠀⠀⠀⠀⠀[/]
[dim #7A3511]⠀⠀⠀⠀⠀⠀⠀tail flame lit⠀⠀⠀⠀⠀⠀⠀⠀[/]""",
    },
    "devbuddy": {
        "name": "devbuddy", "description": "DevBuddy — local-first blue, by TokenBurners",
        "colors": {
            "banner_border": "#3b82f6", "banner_title": "#8fe1ff", "banner_accent": "#5b9dfb",
            "banner_dim": "#5b21b6", "banner_text": "#dce9ff", "ui_accent": "#5b9dfb",
            "ui_label": "#8fe1ff", "ui_ok": "#4caf50", "ui_error": "#ef5350", "ui_warn": "#ffa726",
            "prompt": "#dce9ff", "input_rule": "#3b82f6", "response_border": "#8fe1ff",
            "status_bar_bg": "#0f1b33", "status_bar_text": "#c9d1d9",
            "status_bar_strong": "#8fe1ff", "status_bar_dim": "#4a5aa0",
            "status_bar_good": "#63D0A6", "status_bar_warn": "#e6a855", "status_bar_bad": "#F7A072",
            "status_bar_critical": "#FF7A7A", "session_label": "#8fe1ff",
            "session_border": "#4a5aa0", "completion_menu_bg": "#0f1b33",
            "completion_menu_current_bg": "#243869", "selection_bg": "#2c4079",
            "shell_dollar": "#5b9dfb", "voice_status_bg": "#0f1b33"},
        "spinner": {},
        "branding": {
            "agent_name": "DevBuddy Agent",
            "welcome": "Welcome to DevBuddy Agent! Type your message or /help for commands.",
            "goodbye": "Goodbye! 🔥", "response_label": " 🔥 DevBuddy ", "prompt_symbol": "❯",
            "help_header": "(🔥) Available Commands"},
        "tool_prefix": "┊",
        "banner_logo": """[bold #8fe1ff]██████╗ ███████╗██╗   ██╗██████╗ ██╗   ██╗██████╗ ██████╗ ██╗   ██╗     █████╗  ██████╗ ███████╗███╗   ██╗████████╗[/]
[bold #6dbbfb]██╔══██╗██╔════╝██║   ██║██╔══██╗██║   ██║██╔══██╗██╔══██╗╚██╗ ██╔╝    ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝[/]
[#4c95f8]██║  ██║█████╗  ██║   ██║██████╔╝██║   ██║██║  ██║██║  ██║ ╚████╔╝     ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   [/]
[#416fe9]██║  ██║██╔══╝  ╚██╗ ██╔╝██╔══██╗██║   ██║██║  ██║██║  ██║  ╚██╔╝      ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   [/]
[#4e48d0]██████╔╝███████╗ ╚████╔╝ ██████╔╝╚██████╔╝██████╔╝██████╔╝   ██║       ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   [/]
[#5b21b6]╚═════╝ ╚══════╝  ╚═══╝  ╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝    ╚═╝       ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   [/]""",
        "banner_hero": """             [#59a2f8 on #55a2fa]▀[/][#529cf8 on #59a8fb]▀[/]       
             [#529df8 on #519bf8]▀[/][#5aacff on #529fff]▀[/][#4d98fa on #4d99ff]▀[/][#468ff8]▄[/]     
       [#63b2fc]▄[/][#5facfb]▄[/]    [#4f98f8 on #4b94f7]▀[/][#4f9cff on #4a94fc]▀[/][#468ef6 on #448df6]▀[/][#4896ff on #418af8]▀[/][#4086f5 on #3f88fc]▀[/][#3a81f2]▄[/]   
     [#62aef8]▄[/][#63aef9 on #68b9ff]▀[/][#6dc3ff on #5eaafb]▀[/][#5ca8f9 on #59a4f8]▀[/]   [#4d97fa on #4993f7]▀[/][#4c97fd on #4c9aff]▀[/][#458ef6 on #428af6]▀[/][#4189f6 on #3f86f7]▀[/][#3d85f6 on #3c82f6]▀[/][#3e86fc on #3b7cf2]▀[/][#3d7df2 on #4382ff]▀[/][#3f75ec]▄[/]  
    [#61aef8 on #65b2fb]▀[/][#67b7ff on #62affc]▀[/][#5fabfa on #5ba6f8]▀[/][#5aa5f9 on #57a2f8]▀[/][#57a3fb on #58a5ff]▀[/][#5099f8]▄[/] [#4691f4]▄[/][#478ef6 on #4894fe]▀[/][#4791fe on #4088f6]▀[/][#3f87f5 on #3d84f6]▀[/][#3c83f6 on #3b80f5]▀[/][#3c7ff4 on #3d7bf2]▀[/][#3d79f0 on #3f77ef]▀[/][#4178f3 on #3f72ea]▀[/][#4071ec on #4776fa]▀[/][#4369e6]▄[/] 
  [#64b3fc]▄[/][#63aef9 on #68baff]▀[/][#67b8ff on #5da8f9]▀[/][#5ca6f8 on #5aa5f9]▀[/][#59a4f9 on #56a0f9]▀[/][#559ff8 on #519cf7]▀[/][#55a3ff on #53a1ff]▀[/][#4e97f8]▀[/][#428af5]▄[/][#448df7 on #4895ff]▀[/][#4591fe on #3e86f6]▀[/][#3d85f6 on #3b82f6]▀[/][#3c81f5 on #3c7ef3]▀[/][#3d7df2 on #3e79f0]▀[/][#3e78f0 on #3f75ed]▀[/][#4074ed on #4170ea]▀[/][#406fe9 on #426ce7]▀[/][#466ff1 on #4468e5]▀[/][#4367e3 on #4564e4]▀[/][#4462e1]▄[/]
 [#62affa]▄[/][#62affa on #67b9ff]▀[/][#62b0fd on #5ba5f8]▀[/][#5aa6f8 on #58a3f9]▀[/][#57a2f9 on #549ff9]▀[/][#539df8 on #509af7]▀[/][#519cfc on #4e99fc]▀[/][#4c95f8 on #4991f7]▀[/][#4891f8 on #448df7]▀[/][#448ffa on #448efe]▀[/][#418bfa on #3c83f4]▀[/][#3c83f5 on #3c80f5]▀[/][#3c7ff4 on #3d7cf2]▀[/][#3e7bf1 on #3e77ef]▀[/][#3f76ee on #4073ec]▀[/][#4072eb on #416ee9]▀[/][#426de8 on #436ae6]▀[/][#4369e5 on #4565e3]▀[/][#4464e2 on #4561e0]▀[/][#4a65eb on #4b60e7]▀[/][#475bdc on #4858da]▀[/]
[#5faffb]▄[/][#61acfa on #60adfc]▀[/][#61b0ff on #5aa4f9]▀[/][#58a4f8 on #56a1f9]▀[/][#55a0f9 on #539df8]▀[/][#529bf8 on #4f98f8]▀[/][#4e97f8 on #4b94f8]▀[/][#4992f7 on #4790f7]▀[/][#4790fa on #438bf6]▀[/][#438dfb on #3f86f5]▀[/][#3d84f5 on #3c83f6]▀[/][#3b81f6 on #3c7ef3]▀[/][#3d7df3 on #3e7af1]▀[/][#3e78f0 on #3f75ee]▀[/][#4074ed on #4171eb]▀[/][#4170ea on #426ce8]▀[/][#426be7 on #4468e5]▀[/][#4467e4 on #4563e2]▀[/][#4562e1 on #475fdf]▀[/][#475edd on #485adb]▀[/][#4a5be0 on #4b57dc]▀[/][#4955d8 on #4a52d5]▀[/]
[#5faaf9 on #5ba7f8]▀[/][#60b0ff on #5caaff]▀[/][#57a1f8 on #549ef8]▀[/][#549ef9 on #519bf8]▀[/][#5099f8 on #4d96f8]▀[/][#4c95f8 on #4992f8]▀[/][#4891f7 on #458ef7]▀[/][#448cf7 on #4189f7]▀[/][#4088f6 on #3d85f6]▀[/][#3d84f6 on #3b81f5]▀[/][#3c7ff4 on #3d7cf2]▀[/][#3e7bf1 on #3f77ef]▀[/][#3f76ee on #4073ec]▀[/][#4072ec on #416fe9]▀[/][#426de9 on #436ae6]▀[/][#4369e6 on #4466e3]▀[/][#4565e3 on #4661e1]▀[/][#4660e0 on #475dde]▀[/][#485cdd on #4958da]▀[/][#4957d9 on #4a54d7]▀[/][#4c54da on #4d51d9]▀[/][#4c4ed4 on #4d4bd1]▀[/]
[#59a4f9 on #56a1f9]▀[/][#58a4fe on #54a0fd]▀[/][#529bf7 on #4f98f7]▀[/][#4e98f8 on #4b94f8]▀[/][#4a93f8 on #4790f7]▀[/][#468ff7 on #438cf7]▀[/][#438af7 on #4087f7]▀[/][#3f86f6 on #3c83f6]▀[/][#3b82f6 on #3c7ef4]▀[/][#3c7df3 on #3d7af1]▀[/][#3e79f0 on #3f76ee]▀[/][#4074ed on #4171eb]▀[/][#4170ea on #426de8]▀[/][#426be7 on #4368e5]▀[/][#4467e4 on #4564e2]▀[/][#4563e1 on #465fdf]▀[/][#475ede on #485bdc]▀[/][#485adb on #4956d9]▀[/][#4a55d8 on #4b52d6]▀[/][#4a50d5 on #4b4dd3]▀[/][#504fdb on #524cdb]▀[/][#4e49d0 on #4f44cd]▀[/]
[#539ef8 on #509af8]▀[/][#529dfe on #519dff]▀[/][#4c95f7 on #4992f6]▀[/][#4891f7 on #458ef7]▀[/][#458df7 on #428af7]▀[/][#4188f6 on #3e85f6]▀[/][#3d84f6 on #3c81f5]▀[/][#3c80f5 on #3d7cf2]▀[/][#3d7bf1 on #3e78ef]▀[/][#3f77ef on #4073ed]▀[/][#4072ec on #416fea]▀[/][#426ee9 on #436ae7]▀[/][#4369e6 on #4466e4]▀[/][#4565e3 on #4662e1]▀[/][#4660e0 on #475dde]▀[/][#475cdd on #4959db]▀[/][#4958da on #4a54d8]▀[/][#4a53d7 on #4b50d5]▀[/][#4c4fd4 on #4d4bd1]▀[/][#4d4ad1 on #5049d4]▀[/][#5248d5 on #4f42cc]▀[/][#4e42cc]▀[/]
[#4d96f8]▀[/][#4f9cff on #4891f8]▀[/][#458ef6 on #448efa]▀[/][#438bf7 on #4087f6]▀[/][#3f86f7 on #3c83f6]▀[/][#3c82f6 on #3c7ff4]▀[/][#3d7df3 on #3e7af1]▀[/][#3e79f0 on #3f76ee]▀[/][#3f75ed on #4071eb]▀[/][#4170ea on #426de8]▀[/][#426ce8 on #4369e5]▀[/][#4467e4 on #4564e2]▀[/][#4563e2 on #4660df]▀[/][#475edf on #485bdc]▀[/][#485adc on #4957da]▀[/][#4a56d9 on #4b52d6]▀[/][#4b51d6 on #4c4ed4]▀[/][#4c4dd3 on #4d49d0]▀[/][#4e48cf on #4f45d0]▀[/][#5649dc on #5241cf]▀[/][#5041cc]▀[/] 
 [#438cf6]▀[/][#4794ff on #3e87f9]▀[/][#3b83f4 on #3d86fc]▀[/][#3b80f5 on #3c7cf0]▀[/][#3d7cf2 on #3e78f0]▀[/][#3f77ef on #4074ed]▀[/][#4073ec on #416fea]▀[/][#426ee9 on #436be7]▀[/][#436ae6 on #4466e4]▀[/][#4466e3 on #4562e1]▀[/][#4661e0 on #475dde]▀[/][#475ddd on #4959db]▀[/][#4958da on #4a55d8]▀[/][#4a54d7 on #4c50d5]▀[/][#4c4fd4 on #4d4cd3]▀[/][#4d4bd2 on #4d47cf]▀[/][#4e46ce on #5647da]▀[/][#5747dd on #513fca]▀[/][#513dc8]▀[/]  
  [#387df2]▀[/][#3e82f9 on #3a75ee]▀[/][#407ef9 on #407af5]▀[/][#3e73eb on #457bfe]▀[/][#4170ea on #436feb]▀[/][#426ce8 on #4269e4]▀[/][#4468e5 on #4464e2]▀[/][#4563e2 on #4660df]▀[/][#475fdf on #475bdc]▀[/][#485adc on #4957d8]▀[/][#4a56d9 on #4a52d7]▀[/][#4b51d6 on #4b4ed3]▀[/][#4c4dd3 on #504cd6]▀[/][#4d48d0 on #564bdf]▀[/][#5549dc on #5243cf]▀[/][#5240cf]▀[/]    
     [#4170ef]▀[/][#446cea]▀[/][#486bef on #4664e7]▀[/][#4965e9 on #4860e2]▀[/][#495fe2 on #4759db]▀[/][#4a5adf on #4956da]▀[/][#4c56dd on #4c51d8]▀[/][#4f53df on #4e4ed6]▀[/][#514edb on #4e49d4]▀[/][#5048d4]▀[/][#5145d1]▀[/]      
[dim #4a5aa0]⠀⠀⠀⠀⠀⠀local-first, always lit⠀⠀⠀⠀⠀⠀[/]""",
    }}

_active_skin: Optional[SkinConfig] = None
_active_skin_name: str = "devbuddy"
# Routed multiplex profiles: (name, skin) per home key. ``display.skin`` and ``<home>/skins/*.yaml``
# are per profile, and the relay display name / TUI skin payload are read under each profile's
# override — one module slot would be last-writer-wins across profiles. Unscoped keeps the module slot.
_active_skin_by_home: Dict[str, Tuple[str, SkinConfig]] = {}


def _routed_home_key() -> Optional[str]:
    from devbuddy_constants import get_hermes_home_override, hermes_home_key
    return None if get_hermes_home_override() is None else hermes_home_key()


def _profile_config() -> dict:
    try:
        from devbuddy_cli.config import load_config_readonly
        return load_config_readonly() or {}
    except Exception:
        return {}


def _skins_dir() -> Path:
    return get_hermes_home() / "skins"


def _load_skin_from_yaml(path: Path) -> Optional[Dict[str, Any]]:
    """Load a skin definition from a YAML file; None on any failure."""
    try:
        import devbuddy_yaml as yaml
        with open(path, "r", encoding="utf-8-sig") as f:
            data = yaml.safe_load(f)
        if isinstance(data, dict) and "name" in data:
            return data
    except Exception as e:
        logger.debug("Failed to load skin from %s: %s", path, e)
    return None


def _build_skin_config(data: Dict[str, Any]) -> SkinConfig:
    """Build a SkinConfig from a raw dict (built-in or loaded from YAML)."""
    default = _BUILTIN_SKINS["default"]
    skin_name = str(data.get("name", "unknown"))

    def section(key: str) -> Dict[str, Any]:
        value = data.get(key)
        if isinstance(value, dict):
            return value
        if value is not None:
            logger.warning("Skin '%s' has invalid '%s' section type (%s); ignoring section",
                           skin_name, key, type(value).__name__)
        return {}

    def merged(key: str) -> Dict[str, Any]:
        return {**default.get(key, {}), **section(key)}
    # Paired palettes are NOT merged over the default skin's blocks: an empty block means
    # "no hand-tuned variant for that polarity" and consumers (the TUI) fall back to `colors`
    # + automatic adaptation, which beats the default's gold light palette under a crimson skin.
    return SkinConfig(
        name=skin_name, description=data.get("description", ""), colors=merged("colors"),
        light_colors=section("light_colors"), dark_colors=section("dark_colors"),
        spinner=merged("spinner"), branding=merged("branding"),
        tool_prefix=data.get("tool_prefix", default.get("tool_prefix", "┊")),
        tool_emojis=section("tool_emojis"), banner_logo=data.get("banner_logo", ""),
        banner_hero=data.get("banner_hero", ""))


def list_skins() -> List[Dict[str, str]]:
    """List all available skins (built-in + user-installed); user skins never shadow built-ins."""
    result = [{"name": name, "description": data.get("description", ""), "source": "builtin"}
              for name, data in _BUILTIN_SKINS.items()]
    skins_path = _skins_dir()
    for f in sorted(skins_path.glob("*.yaml")) if skins_path.is_dir() else ():
        data = _load_skin_from_yaml(f)
        if data and not any(s["name"] == data.get("name", f.stem) for s in result):
            result.append({"name": data.get("name", f.stem), "description": data.get("description", ""),
                           "source": "user"})
    return result


def load_skin(name: str) -> SkinConfig:
    """Load a skin by name: user skins first, then built-in, then default."""
    user_file = _skins_dir() / f"{name}.yaml"
    data = _load_skin_from_yaml(user_file) if user_file.is_file() else None
    if not data and name not in _BUILTIN_SKINS:
        logger.warning("Skin '%s' not found, using default", name)
    return _build_skin_config(data or _BUILTIN_SKINS.get(name) or _BUILTIN_SKINS["default"])


def get_active_skin() -> SkinConfig:
    """Currently active skin config (cached)."""
    global _active_skin
    home_key = _routed_home_key()
    if home_key is not None:
        entry = _active_skin_by_home.get(home_key)
        if entry is None:
            # Cold routed profile: its own ``display.skin`` (nobody ran init_skin_from_config for it).
            init_skin_from_config(_profile_config())
            entry = _active_skin_by_home[home_key]
        return entry[1]
    if _active_skin is None:
        _active_skin = load_skin(_active_skin_name)
    return _active_skin


def set_active_skin(name: str) -> SkinConfig:
    """Switch the active skin. Returns the new SkinConfig."""
    global _active_skin, _active_skin_name
    skin = load_skin(name)
    home_key = _routed_home_key()
    if home_key is not None:
        _active_skin_by_home[home_key] = (name, skin)
        return skin
    _active_skin_name = name
    _active_skin = skin
    return _active_skin


def get_active_skin_name() -> str:
    home_key = _routed_home_key()
    if home_key is not None:
        entry = _active_skin_by_home.get(home_key)
        return entry[0] if entry else "default"
    return _active_skin_name


def init_skin_from_config(config: dict) -> None:
    """Initialize the active skin from CLI config at startup."""
    display = config.get("display") or {}
    skin_name = display.get("skin", "devbuddy") if isinstance(display, dict) else "devbuddy"
    set_active_skin(skin_name.strip() if isinstance(skin_name, str) and skin_name.strip() else "devbuddy")


def _active_branding(key: str, fallback: str) -> str:
    try:
        return get_active_skin().get_branding(key, fallback)
    except Exception:
        return fallback


def get_active_prompt_symbol(fallback: str = "❯") -> str:
    """Interactive prompt symbol (skins store a bare token) plus a single trailing space."""
    cleaned = (_active_branding("prompt_symbol", fallback) or fallback).strip()
    return f"{cleaned or fallback.strip()} "


def get_active_help_header(fallback: str = "(^_^)? Available Commands") -> str:
    return _active_branding("help_header", fallback)


def get_active_goodbye(fallback: str = "Goodbye! ☤") -> str:
    return _active_branding("goodbye", fallback)


# Palette resolution order for prompt_toolkit styles: (name, skin color key, fallback). A
# fallback starting with "@" names an earlier entry (so a missing key inherits its remapped value).
_STYLE_PALETTE = (
    ("prompt", "prompt", ""), ("input_rule", "input_rule", "#CD7F32"),
    ("title", "banner_title", "#FFD700"), ("text", "banner_text", "#FFF8DC"),
    ("dim", "banner_dim", "#555555"), ("label", "ui_label", "@title"), ("warn", "ui_warn", "#FF8C00"),
    ("error", "ui_error", "#FF6B6B"), ("status_bg", "status_bar_bg", "#1a1a2e"),
    ("status_text", "status_bar_text", "@text"), ("status_strong", "status_bar_strong", "@title"),
    ("status_dim", "status_bar_dim", "@dim"), ("ok", "ui_ok", "#8FBC8F"),
    ("status_good", "status_bar_good", "@ok"), ("status_warn", "status_bar_warn", "@warn"),
    ("accent", "banner_accent", "@warn"), ("status_bad", "status_bar_bad", "@accent"),
    ("status_critical", "status_bar_critical", "@error"), ("voice_bg", "voice_status_bg", "@status_bg"),
    ("menu_bg", "completion_menu_bg", "#1a1a2e"), ("menu_current_bg", "completion_menu_current_bg", "#333355"),
    ("menu_meta_bg", "completion_menu_meta_bg", "@menu_bg"),
    ("menu_meta_current_bg", "completion_menu_meta_current_bg", "@menu_current_bg"))

# prompt_toolkit style class -> format template over the resolved palette names.
_STYLE_TEMPLATES = {
    "input-area": "",  # terminal default fg/bg — `prompt` styles the symbol, NOT typed text
    "placeholder": "{dim} italic", "prompt": "{prompt}", "prompt-working": "{dim} italic",
    "hint": "{dim} italic",
    "status-bar": "bg:{status_bg} {status_text}", "status-bar-strong": "bg:{status_bg} {status_strong} bold",
    "status-bar-session-title": "bg:{badge_bg} {badge_fg} bold",
    "status-bar-dim": "bg:{status_bg} {status_dim}", "status-bar-good": "bg:{status_bg} {status_good} bold",
    "status-bar-warn": "bg:{status_bg} {status_warn} bold", "status-bar-bad": "bg:{status_bg} {status_bad} bold",
    "status-bar-critical": "bg:{status_bg} {status_critical} bold",
    "subagent-dock": "bg:{status_bg} {status_text}",
    "subagent-dock.heading": "bg:{status_bg} {status_strong} bold",
    "subagent-dock.selected": "bg:{menu_current_bg} {text} bold",
    "input-rule": "{input_rule}", "image-badge": "{label} bold",
    "completion-menu": "bg:{menu_bg} {text}", "completion-menu.completion": "bg:{menu_bg} {text}",
    "completion-menu.completion.current": "bg:{menu_current_bg} {title}",
    "completion-menu.meta.completion": "bg:{menu_meta_bg} {dim}",
    "completion-menu.meta.completion.current": "bg:{menu_meta_current_bg} {label}",
    "clarify-border": "{input_rule}", "clarify-title": "{title} bold", "clarify-question": "{text} bold",
    "clarify-choice": "{dim}", "clarify-selected": "{title} bold", "clarify-active-other": "{title} italic",
    "clarify-countdown": "{input_rule}",
    "sudo-prompt": "{error} bold", "sudo-border": "{input_rule}", "sudo-title": "{error} bold",
    "sudo-text": "{text}",
    "approval-border": "{input_rule}", "approval-title": "{warn} bold", "approval-desc": "{text} bold",
    "approval-cmd": "{dim} italic", "approval-choice": "{dim}", "approval-selected": "{title} bold",
    "voice-status": "bg:{voice_bg} {label}", "voice-status-recording": "bg:{voice_bg} {error} bold"}


def get_prompt_toolkit_style_overrides() -> Dict[str, str]:
    """Return prompt_toolkit style overrides derived from the active skin."""
    try:
        skin = get_active_skin()
    except Exception:
        return {}
    # `prompt` is unset by default so typed text inherits the terminal's foreground (readable
    # on light and dark schemes); skins opt into a colored prompt symbol via `prompt` in YAML.
    # Every read goes through skin.get_color (cli.py wraps it for light-mode remapping).
    palette: Dict[str, str] = {}
    for name, key, fallback in _STYLE_PALETTE:
        palette[name] = skin.get_color(key, palette[fallback[1:]] if fallback.startswith("@") else fallback)
    # This badge paints both sides; foreground-only light remapping destroys its contrast.
    palette["badge_bg"] = skin.colors.get(
        "status_bar_strong", skin.colors.get("banner_title", "#FFD700"))
    palette["badge_fg"] = skin.colors.get("status_bar_bg", "#1a1a2e")
    return {cls: tpl.format(**palette) for cls, tpl in _STYLE_TEMPLATES.items()}
