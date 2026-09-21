"""Une las grabaciones reales de cuatro procesos de navegador y añade rótulos."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'artifacts' / 'persistence'
RUN = Path(json.loads((ARTIFACTS / 'latest-recording.json').read_text(encoding='utf-8'))['directory'])
REPORT = json.loads((RUN / 'report.json').read_text(encoding='utf-8'))
assert REPORT['passed'] and len(REPORT['segments']) == 4, 'Se requieren cuatro sesiones verificadas.'
WORK = RUN / 'render'
WORK.mkdir(exist_ok=True)
OUTPUT = ROOT / 'docs' / 'videos'
OUTPUT.mkdir(parents=True, exist_ok=True)
FFMPEG = os.environ.get('FFMPEG_PATH') or imageio_ffmpeg.get_ffmpeg_exe()
WIDTH, HEIGHT, HEADER, FPS = 1280, 900, 100, 25
BG, INK, PURPLE, MUTED = '#15152C', '#FFFFFF', '#A99AFF', '#D2CDE7'


def font(size, bold=False):
    paths = [
        Path('C:/Windows/Fonts') / ('arialbd.ttf' if bold else 'arial.ttf'),
        Path('/usr/share/fonts/truetype/dejavu') / ('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'),
    ]
    for candidate in paths:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default(size=size)


def run_ffmpeg(arguments):
    result = subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', *arguments], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr)


def duration(filename):
    reader = imageio_ffmpeg.read_frames(str(filename))
    try:
        return next(reader)['duration']
    finally:
        reader.close()


def card(name, eyebrow, heading, lines, seconds):
    image = Image.new('RGB', (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((70, 180, 78, 710), radius=4, fill=PURPLE)
    draw.text((112, 194), eyebrow, font=font(23, True), fill=PURPLE)
    draw.text((108, 274), heading, font=font(48, True), fill=INK)
    for index, line in enumerate(lines):
        draw.text((112, 390 + index * 62), line, font=font(29), fill=MUTED)
    draw.text((112, 768), 'NOVACART   /   ENTREGA DE PERSISTENCIA', font=font(20, True), fill=PURPLE)
    png = WORK / f'{name}.png'
    image.save(png)
    target = WORK / f'{name}.mp4'
    run_ffmpeg(['-loop', '1', '-i', str(png), '-t', str(seconds), '-r', str(FPS),
                '-vf', 'setsar=1,format=yuv420p', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', str(target)])
    return target


pieces = [card('intro', 'DEMOSTRACIÓN CON LA APLICACIÓN REAL', 'Los datos permanecen al reabrir', [
    'SQLite: productos, usuarios y sesiones.',
    'Almacenamiento local: artículos del carrito.',
    'Alta, consulta, modificación y eliminación.',
    'Cuatro sesiones y tres reaperturas completas.',
], 4)]
chapters = []

for index, segment in enumerate(REPORT['segments']):
    if index:
        previous = REPORT['sessions'][index - 1]
        following = REPORT['sessions'][index]
        assert previous['browserClosedAt'] and previous['serverClosedAt']
        pieces.append(card(f'cierre-{index}', 'TRANSICIÓN ENTRE GRABACIONES', f'Cierre real {index} de 3', [
            'El navegador se cerró y el servidor terminó.',
            'Se abren procesos nuevos con los mismos archivos.',
            f"Servidor: PID {previous['serverPid']} cerrado; nuevo PID {following['serverPid']}.",
            'La prueba no reinyecta productos, tokens ni carrito.',
        ], 3))
    header = Image.new('RGB', (WIDTH, HEADER), BG)
    draw = ImageDraw.Draw(header)
    draw.text((30, 12), segment['title'], font=font(29, True), fill=PURPLE)
    draw.text((30, 56), segment['description'], font=font(23), fill=INK)
    header_path = WORK / f'header-{index}.png'
    header.save(header_path)
    target = WORK / f'session-{index + 1}.mp4'
    run_ffmpeg(['-i', segment['path'], '-i', str(header_path), '-filter_complex',
                f'[0:v]pad={WIDTH}:{HEIGHT}:0:{HEADER}:color=0x15152C[base];'
                f'[base][1:v]overlay=0:0:eof_action=repeat,setsar=1,fps={FPS},format=yuv420p',
                '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', str(target)])
    chapters.append({'title': segment['title'], 'startSeconds': round(sum(duration(piece) for piece in pieces), 2),
                     'durationSeconds': duration(target)})
    pieces.append(target)

pieces.append(card('final', 'RESULTADO VERIFICADO', 'Persistencia comprobada', [
    'El alta permaneció después del primer cierre.',
    'La edición permaneció después del segundo cierre.',
    'El borrado permaneció después del tercer cierre.',
    f"{len(REPORT['checks'])} comprobaciones correctas. Informe y código en Git.",
], 4))
concat = WORK / 'concat.txt'
concat.write_text(''.join(f"file '{piece.name}'\n" for piece in pieces), encoding='utf-8')
video = OUTPUT / 'persistencia-novacart.mp4'
run_ffmpeg(['-f', 'concat', '-safe', '0', '-i', str(concat), '-c', 'copy', '-movflags', '+faststart', str(video)])
public = {key: value for key, value in REPORT.items() if key not in ('segments', 'viewport')}
public['video'] = {
    'file': 'docs/videos/persistencia-novacart.mp4', 'durationSeconds': duration(video),
    'width': WIDTH, 'height': HEIGHT, 'fps': FPS,
    'sha256': hashlib.sha256(video.read_bytes()).hexdigest(), 'chapters': chapters,
    'editing': 'Cuatro grabaciones reales en orden, unidas con rótulos. Sin audio ni sustitución de datos.',
}
evidence = ROOT / 'docs' / 'evidencia'
evidence.mkdir(exist_ok=True)
(evidence / 'persistencia-verificacion.json').write_text(json.dumps(public, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
Image.open(WORK / 'intro.png').save(OUTPUT / 'portada-persistencia.png')
print(json.dumps(public['video'], ensure_ascii=False, indent=2))
