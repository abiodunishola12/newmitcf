from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

Color = Tuple[int, int, int]


PALETTE: List[Color] = [
    (44, 123, 182),
    (215, 48, 39),
    (26, 152, 80),
    (253, 174, 97),
    (106, 61, 154),
    (31, 120, 180),
    (227, 26, 28),
    (51, 160, 44),
    (255, 127, 0),
    (166, 86, 40),
    (102, 194, 165),
    (252, 141, 98),
    (141, 160, 203),
    (231, 138, 195),
    (166, 216, 84),
    (255, 217, 47),
    (229, 196, 148),
    (179, 179, 179),
    (67, 162, 202),
    (240, 59, 32),
]


class Image:
    def __init__(self, width: int, height: int, background: Color = (255, 255, 255)) -> None:
        self.width = width
        self.height = height
        self.pixels = bytearray(background * (width * height))

    def set_pixel(self, x: int, y: int, color: Color) -> None:
        if 0 <= x < self.width and 0 <= y < self.height:
            idx = (y * self.width + x) * 3
            self.pixels[idx : idx + 3] = bytes(color)

    def fill_rect(self, x: int, y: int, width: int, height: int, color: Color) -> None:
        for yy in range(max(0, y), min(self.height, y + height)):
            start = max(0, x)
            end = min(self.width, x + width)
            for xx in range(start, end):
                self.set_pixel(xx, yy, color)

    def stroke_rect(self, x: int, y: int, width: int, height: int, color: Color) -> None:
        self.line(x, y, x + width, y, color)
        self.line(x, y + height, x + width, y + height, color)
        self.line(x, y, x, y + height, color)
        self.line(x + width, y, x + width, y + height, color)

    def fill_polygon(self, points: Sequence[Tuple[int, int]], color: Color) -> None:
        if len(points) < 3:
            return
        min_y = max(0, min(y for _, y in points))
        max_y = min(self.height - 1, max(y for _, y in points))
        for y in range(min_y, max_y + 1):
            intersections: List[float] = []
            for idx, (x0, y0) in enumerate(points):
                x1, y1 = points[(idx + 1) % len(points)]
                if y0 == y1:
                    continue
                if (y >= min(y0, y1)) and (y < max(y0, y1)):
                    intersections.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
            intersections.sort()
            for left, right in zip(intersections[0::2], intersections[1::2]):
                for x in range(max(0, int(math.ceil(left))), min(self.width, int(math.floor(right)) + 1)):
                    self.set_pixel(x, y, color)

    def stroke_polygon(self, points: Sequence[Tuple[int, int]], color: Color) -> None:
        if len(points) < 2:
            return
        for start, end in zip(points, [*points[1:], points[0]]):
            self.line(start[0], start[1], end[0], end[1], color)

    def line(self, x0: int, y0: int, x1: int, y1: int, color: Color) -> None:
        dx = abs(x1 - x0)
        sx = 1 if x0 < x1 else -1
        dy = -abs(y1 - y0)
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            self.set_pixel(x0, y0, color)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def text(self, x: int, y: int, text: str, color: Color = (35, 35, 35), scale: int = 2) -> None:
        cursor = x
        for char in str(text).upper():
            glyph = FONT.get(char, FONT["?"])
            for yy, row in enumerate(glyph):
                for xx, bit in enumerate(row):
                    if bit == "1":
                        self.fill_rect(cursor + xx * scale, y + yy * scale, scale, scale, color)
            cursor += (len(glyph[0]) + 1) * scale

    def save(self, path: str | Path) -> None:
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        raw = bytearray()
        row_bytes = self.width * 3
        for y in range(self.height):
            raw.append(0)
            start = y * row_bytes
            raw.extend(self.pixels[start : start + row_bytes])
        payload = b"".join(
            [
                _chunk(b"IHDR", struct.pack(">IIBBBBB", self.width, self.height, 8, 2, 0, 0, 0)),
                _chunk(b"IDAT", zlib.compress(bytes(raw), 9)),
                _chunk(b"IEND", b""),
            ]
        )
        target.write_bytes(b"\x89PNG\r\n\x1a\n" + payload)


def bar_chart(path: str | Path, labels: Sequence[str], values: Sequence[float], title: str, *, y_max: float = 1.0) -> None:
    width, height = 1200, 720
    img = Image(width, height)
    margin_left, margin_right, margin_top, margin_bottom = 80, 40, 70, 115
    plot_w = width - margin_left - margin_right
    plot_h = height - margin_top - margin_bottom
    img.text(32, 24, title, scale=2)
    _axes(img, margin_left, margin_top, plot_w, plot_h)
    _grid(img, margin_left, margin_top, plot_w, plot_h, y_max)
    count = max(1, len(values))
    slot = plot_w / count
    bar_w = max(6, int(slot * 0.68))
    for idx, value in enumerate(values):
        x = int(margin_left + idx * slot + (slot - bar_w) / 2)
        bar_h = int(plot_h * _clip(value / y_max))
        y = margin_top + plot_h - bar_h
        img.fill_rect(x, y, bar_w, bar_h, PALETTE[idx % len(PALETTE)])
        img.text(x, margin_top + plot_h + 12, str(idx + 1), scale=2)
    _draw_key(img, labels[:20], width - 360, 86)
    img.save(path)


def grouped_bar_chart(
    path: str | Path,
    labels: Sequence[str],
    series: Dict[str, Sequence[float]],
    title: str,
    *,
    y_max: float = 1.0,
) -> None:
    width, height = 1280, 760
    img = Image(width, height)
    margin_left, margin_right, margin_top, margin_bottom = 80, 260, 70, 115
    plot_w = width - margin_left - margin_right
    plot_h = height - margin_top - margin_bottom
    img.text(32, 24, title, scale=2)
    _axes(img, margin_left, margin_top, plot_w, plot_h)
    _grid(img, margin_left, margin_top, plot_w, plot_h, y_max)
    names = list(series)
    count = max(1, len(labels))
    slot = plot_w / count
    bar_w = max(3, int((slot * 0.75) / max(1, len(names))))
    for idx in range(count):
        for s_idx, name in enumerate(names):
            values = series[name]
            value = values[idx] if idx < len(values) else 0.0
            x = int(margin_left + idx * slot + slot * 0.1 + s_idx * bar_w)
            bar_h = int(plot_h * _clip(value / y_max))
            y = margin_top + plot_h - bar_h
            img.fill_rect(x, y, bar_w, bar_h, PALETTE[s_idx % len(PALETTE)])
        img.text(int(margin_left + idx * slot), margin_top + plot_h + 12, str(idx + 1), scale=2)
    for s_idx, name in enumerate(names):
        y = 90 + s_idx * 28
        img.fill_rect(width - 230, y, 18, 18, PALETTE[s_idx % len(PALETTE)])
        img.text(width - 204, y, name[:22], scale=2)
    _draw_key(img, labels[:20], width - 1240, height - 72, horizontal=True)
    img.save(path)


def line_chart(path: str | Path, series: Dict[str, Sequence[float]], title: str, *, y_max: float | None = None) -> None:
    width, height = 1280, 760
    img = Image(width, height)
    margin_left, margin_right, margin_top, margin_bottom = 80, 300, 70, 80
    plot_w = width - margin_left - margin_right
    plot_h = height - margin_top - margin_bottom
    max_value = y_max if y_max is not None else max((max(vals) for vals in series.values() if vals), default=1.0)
    max_value = max(max_value, 1e-9)
    img.text(32, 24, title, scale=2)
    _axes(img, margin_left, margin_top, plot_w, plot_h)
    _grid(img, margin_left, margin_top, plot_w, plot_h, max_value)
    for idx, (name, values) in enumerate(series.items()):
        if len(values) < 2:
            continue
        points = []
        for x_idx, value in enumerate(values):
            x = margin_left + int((plot_w * x_idx) / (len(values) - 1))
            y = margin_top + plot_h - int(plot_h * _clip(value / max_value))
            points.append((x, y))
        color = PALETTE[idx % len(PALETTE)]
        for (x0, y0), (x1, y1) in zip(points, points[1:]):
            img.line(x0, y0, x1, y1, color)
            img.line(x0, y0 + 1, x1, y1 + 1, color)
        y = 90 + idx * 28
        if y < height - 30:
            img.fill_rect(width - 270, y, 18, 18, color)
            img.text(width - 244, y, name[:24], scale=2)
    img.save(path)


def heatmap(path: str | Path, row_labels: Sequence[str], col_labels: Sequence[str], matrix: Sequence[Sequence[float]], title: str) -> None:
    width, height = 1200, 760
    img = Image(width, height)
    img.text(32, 24, title, scale=2)
    left, top = 110, 100
    cell_w = max(24, min(46, int((width - left - 80) / max(1, len(col_labels)))))
    cell_h = max(18, min(28, int((height - top - 80) / max(1, len(row_labels)))))
    for c_idx, label in enumerate(col_labels):
        img.text(left + c_idx * cell_w, top - 32, label[:4], scale=1)
    for r_idx, label in enumerate(row_labels):
        y = top + r_idx * cell_h
        img.text(16, y + 5, f"{r_idx + 1:02d}", scale=1)
        for c_idx, value in enumerate(matrix[r_idx]):
            x = left + c_idx * cell_w
            img.fill_rect(x, y, cell_w - 1, cell_h - 1, _heat_color(value))
    _draw_key(img, row_labels[:20], width - 390, 100)
    img.save(path)


def accuracy_bar_chart_3d(
    path: str | Path,
    *,
    model_name: str,
    train_accuracy: float,
    validation_accuracy: float,
    test_accuracy: float,
) -> None:
    width, height = 960, 640
    img = Image(width, height, background=(250, 252, 253))
    title = model_name.replace("_", " ")[:45]
    img.text(34, 28, "3D ACCURACY", scale=3)
    img.text(36, 78, title, scale=2)

    origin_x, origin_y = 150, 510
    axis_h = 340
    axis_w = 590
    depth_x, depth_y = 74, -52
    axis_color = (38, 50, 56)
    grid_color = (214, 222, 226)

    for step in range(5):
        frac = step / 4
        y = origin_y - int(axis_h * frac)
        img.line(origin_x, y, origin_x + axis_w, y, grid_color)
        img.line(origin_x + depth_x, y + depth_y, origin_x + axis_w + depth_x, y + depth_y, grid_color)
        img.line(origin_x, y, origin_x + depth_x, y + depth_y, grid_color)
        img.text(50, y - 8, f"{int(frac * 100)}%", scale=2)

    img.line(origin_x, origin_y, origin_x, origin_y - axis_h, axis_color)
    img.line(origin_x, origin_y, origin_x + axis_w, origin_y, axis_color)
    img.line(origin_x, origin_y, origin_x + depth_x, origin_y + depth_y, axis_color)
    img.line(origin_x + axis_w, origin_y, origin_x + axis_w + depth_x, origin_y + depth_y, axis_color)
    img.line(origin_x + depth_x, origin_y + depth_y, origin_x + axis_w + depth_x, origin_y + depth_y, axis_color)
    img.line(origin_x + depth_x, origin_y + depth_y, origin_x + depth_x, origin_y + depth_y - axis_h, axis_color)

    values = [
        ("TRAIN", train_accuracy, (44, 123, 182)),
        ("VALID", validation_accuracy, (26, 152, 80)),
        ("TEST", test_accuracy, (215, 48, 39)),
    ]
    bar_w = 92
    gap = 90
    start_x = origin_x + 62
    for idx, (label, value, color) in enumerate(values):
        x = start_x + idx * (bar_w + gap)
        _draw_3d_bar(img, x, origin_y, bar_w, int(axis_h * _clip(value)), depth_x // 2, depth_y // 2, color)
        img.text(x + 6, origin_y + 18, label, scale=2)
        img.text(x + 16, origin_y - int(axis_h * _clip(value)) - 48, f"{value * 100:.1f}%", scale=2)

    img.text(700, 150, "METRICS", scale=2)
    for idx, (label, value, color) in enumerate(values):
        y = 195 + idx * 46
        img.fill_rect(704, y, 22, 22, color)
        img.text(740, y - 2, f"{label}: {value * 100:.1f}%", scale=2)
    img.save(path)


def _axes(img: Image, left: int, top: int, width: int, height: int) -> None:
    axis = (40, 40, 40)
    img.line(left, top, left, top + height, axis)
    img.line(left, top + height, left + width, top + height, axis)


def _grid(img: Image, left: int, top: int, width: int, height: int, y_max: float) -> None:
    grid = (225, 225, 225)
    text = (80, 80, 80)
    for step in range(6):
        frac = step / 5
        y = top + height - int(height * frac)
        img.line(left, y, left + width, y, grid)
        img.text(18, y - 8, f"{frac * y_max:.1f}", color=text, scale=1)


def _draw_key(img: Image, labels: Sequence[str], x: int, y: int, *, horizontal: bool = False) -> None:
    for idx, label in enumerate(labels):
        if horizontal:
            xx = x + idx * 58
            yy = y
            img.text(xx, yy, str(idx + 1), scale=1)
        else:
            xx = x
            yy = y + idx * 26
            img.text(xx, yy, f"{idx + 1}. {label[:28]}", scale=1)


def _heat_color(value: float) -> Color:
    value = _clip(value)
    red = int(240 * (1 - value) + 28 * value)
    green = int(70 * (1 - value) + 150 * value)
    blue = int(80 * (1 - value) + 115 * value)
    return red, green, blue


def _draw_3d_bar(
    img: Image,
    x: int,
    base_y: int,
    width: int,
    height: int,
    depth_x: int,
    depth_y: int,
    color: Color,
) -> None:
    front_top = base_y - height
    edge = (45, 55, 60)
    side = _shade(color, 0.76)
    top = _shade(color, 1.18)
    front = color

    img.fill_rect(x, front_top, width, height, front)
    img.fill_polygon(
        [
            (x + width, front_top),
            (x + width + depth_x, front_top + depth_y),
            (x + width + depth_x, base_y + depth_y),
            (x + width, base_y),
        ],
        side,
    )
    img.fill_polygon(
        [
            (x, front_top),
            (x + depth_x, front_top + depth_y),
            (x + width + depth_x, front_top + depth_y),
            (x + width, front_top),
        ],
        top,
    )
    img.stroke_rect(x, front_top, width, height, edge)
    img.stroke_polygon(
        [
            (x, front_top),
            (x + depth_x, front_top + depth_y),
            (x + width + depth_x, front_top + depth_y),
            (x + width, front_top),
        ],
        edge,
    )
    img.stroke_polygon(
        [
            (x + width, front_top),
            (x + width + depth_x, front_top + depth_y),
            (x + width + depth_x, base_y + depth_y),
            (x + width, base_y),
        ],
        edge,
    )


def _shade(color: Color, factor: float) -> Color:
    return tuple(max(0, min(255, int(channel * factor))) for channel in color)  # type: ignore[return-value]


def _clip(value: float) -> float:
    if math.isnan(value):
        return 0.0
    return max(0.0, min(1.0, value))


def _chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


FONT: Dict[str, Tuple[str, ...]] = {
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01111", "10000", "10000", "10111", "10001", "10001", "01111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("11111", "00100", "00100", "00100", "00100", "00100", "11111"),
    "J": ("00111", "00010", "00010", "00010", "10010", "10010", "01100"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "10101", "01010"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "10000", "11110", "00001", "00001", "11110"),
    "6": ("01110", "10000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00001", "01110"),
    " ": ("000", "000", "000", "000", "000", "000", "000"),
    ".": ("0", "0", "0", "0", "0", "0", "1"),
    ",": ("0", "0", "0", "0", "0", "1", "1"),
    "-": ("0000", "0000", "0000", "1111", "0000", "0000", "0000"),
    "_": ("00000", "00000", "00000", "00000", "00000", "00000", "11111"),
    ":": ("0", "1", "0", "0", "0", "1", "0"),
    "/": ("00001", "00010", "00010", "00100", "01000", "01000", "10000"),
    "(": ("001", "010", "100", "100", "100", "010", "001"),
    ")": ("100", "010", "001", "001", "001", "010", "100"),
    "%": ("11001", "11010", "00010", "00100", "01000", "01011", "10011"),
    "?": ("01110", "10001", "00001", "00010", "00100", "00000", "00100"),
}
