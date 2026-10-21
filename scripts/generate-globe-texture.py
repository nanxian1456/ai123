"""Generate the offline globe texture from the same polygons as its borders."""
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw


root = Path(__file__).resolve().parents[1]
world = json.loads(subprocess.check_output(
    ["node", "-e", "process.stdout.write(JSON.stringify(require('./miniprogram/assets/data/world.js')))"],
    cwd=root,
))
width, height = 2048, 1024
ocean, land = "#071c3b", "#29965b"
image = Image.new("RGB", (width, height), ocean)

for feature in world:
    for polygon in feature["polygons"]:
        mask = Image.new("L", (width, height), 0)
        draw = ImageDraw.Draw(mask)
        anchor = polygon[0][0][0]
        for index, ring in enumerate(polygon):
            points = []
            previous = anchor
            for longitude, latitude in ring:
                while longitude - previous > 180:
                    longitude -= 360
                while longitude - previous < -180:
                    longitude += 360
                points.append(((longitude + 180) / 360 * width, (90 - latitude) / 180 * height))
                previous = longitude
            for shift in (-width, 0, width):
                draw.polygon([(x + shift, y) for x, y in points], fill=0 if index else 255)
        image.paste(land, mask=mask)

image.save(root / "miniprogram/assets/images/globe-land.png", optimize=True)
