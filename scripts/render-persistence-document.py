"""Genera el PDF desde docs/PERSISTENCIA.md, conservando una sola fuente textual."""
from html import escape
from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Preformatted, PageBreak

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/PERSISTENCIA.md'
OUTPUT = ROOT / 'output/pdf/NovaCart_Persistencia.pdf'
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
regular, bold = 'Helvetica', 'Helvetica-Bold'
for normal_path, bold_path in [
    (Path('C:/Windows/Fonts/arial.ttf'), Path('C:/Windows/Fonts/arialbd.ttf')),
    (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')),
]:
    if normal_path.exists() and bold_path.exists():
        regular, bold = 'NovaSans', 'NovaSansBold'
        pdfmetrics.registerFont(TTFont(regular, str(normal_path)))
        pdfmetrics.registerFont(TTFont(bold, str(bold_path)))
        pdfmetrics.registerFontFamily(regular, normal=regular, bold=bold, italic=regular, boldItalic=bold)
        break
styles = getSampleStyleSheet()
base = dict(fontName=regular, textColor=colors.HexColor('#28243e'), alignment=TA_LEFT)
styles.add(ParagraphStyle(name='BodyNova', fontSize=9.4, leading=13.1, spaceAfter=7, **base))
styles.add(ParagraphStyle(name='TitleNova', fontName=bold, fontSize=25, leading=29, spaceAfter=10, textColor=colors.HexColor('#292344')))
styles.add(ParagraphStyle(name='HeadingNova', fontName=bold, fontSize=12.8, leading=16, spaceBefore=10, spaceAfter=6, textColor=colors.HexColor('#654acc'), keepWithNext=True))
styles.add(ParagraphStyle(name='TableNova', fontSize=8.5, leading=11.3, **base))
styles.add(ParagraphStyle(name='CodeNova', fontName='Courier', fontSize=8.1, leading=11, backColor=colors.HexColor('#f2effa'), borderPadding=8, spaceAfter=8))
width = A4[0] - 88


def inline(text):
    text = escape(text)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', lambda match: link(match.group(1), match.group(2)), text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    return re.sub(r'`([^`]+)`', r'<font name="Courier" size="8.5">\1</font>', text)


def link(label, target):
    if not target.startswith('https://'):
        target = 'https://github.com/Luvleydie/Fued9cuatri/blob/main/docs/' + target
    return f'<link href="{target}" color="#654acc">{label}</link>'


story = []
lines = SOURCE.read_text(encoding='utf-8').splitlines()
index = 0
while index < len(lines):
    line = lines[index].strip()
    if not line:
        index += 1
        continue
    if line == '<!-- salto-de-pagina -->':
        story.append(PageBreak())
    elif line.startswith('# '):
        story.append(Paragraph(inline(line[2:]), styles['TitleNova']))
    elif line.startswith('## '):
        story.append(Paragraph(inline(line[3:]), styles['HeadingNova']))
    elif line.startswith('```'):
        code = []
        index += 1
        while index < len(lines) and not lines[index].startswith('```'):
            code.append(lines[index])
            index += 1
        story.append(Preformatted('\n'.join(code), styles['CodeNova']))
    elif line.startswith('|'):
        rows = []
        while index < len(lines) and lines[index].startswith('|'):
            cells = [cell.strip() for cell in lines[index].strip().strip('|').split('|')]
            if not all(re.fullmatch(r'[-: ]+', cell) for cell in cells):
                rows.append([Paragraph(inline(cell), styles['TableNova']) for cell in cells])
            index += 1
        proportions = [0.30, 0.70] if len(rows[0]) == 2 else [0.19, 0.47, 0.34]
        table = Table(rows, colWidths=[width * part for part in proportions], repeatRows=1, hAlign='LEFT')
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e9e3fb')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f7fc')]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LINEBELOW', (0, 0), (-1, 0), 0.7, colors.HexColor('#c9bcec')),
        ]))
        story.extend([table, Spacer(1, 9)])
        continue
    else:
        paragraph = [line]
        while index + 1 < len(lines) and lines[index + 1].strip() and not lines[index + 1].startswith(('#', '|', '```', '<!--')):
            index += 1
            paragraph.append(lines[index])
        story.append(Paragraph(inline(' '.join(paragraph)), styles['BodyNova']))
    index += 1


def frame(canvas, document):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor('#654acc'))
    canvas.setFont(bold, 8)
    canvas.drawString(44, A4[1] - 32, 'NOVACART  /  ENTREGA DE PERSISTENCIA')
    canvas.setStrokeColor(colors.HexColor('#ded8ed'))
    canvas.line(44, 39, A4[0] - 44, 39)
    canvas.setFillColor(colors.HexColor('#777287'))
    canvas.setFont(regular, 8)
    canvas.drawString(44, 26, '21 de septiembre de 2026  |  SQLite + almacenamiento local')
    canvas.drawRightString(A4[0] - 44, 26, str(document.page))
    canvas.restoreState()


SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=44, leftMargin=44, topMargin=51, bottomMargin=49,
                  title='NovaCart - Persistencia de información', author='Proyecto NovaCart').build(story, onFirstPage=frame, onLaterPages=frame)
print(OUTPUT)
