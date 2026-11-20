"""Draws the Mero Paisa mark (a wallet with a coin) as SVGs for ImageMagick."""
def mark(body, band, coin, ring, pocket, clasp):
    return f'''
  <circle cx="610" cy="345" r="125" fill="{coin}"/>
  <circle cx="610" cy="345" r="92" fill="{ring}"/>
  <circle cx="610" cy="345" r="72" fill="{coin}"/>
  <rect x="222" y="405" width="580" height="400" rx="76" ry="76" fill="{body}"/>
  <rect x="222" y="405" width="580" height="96" rx="48" ry="48" fill="{band}"/>
  <rect x="222" y="453" width="580" height="48" fill="{band}"/>
  <rect x="592" y="548" width="238" height="150" rx="56" ry="56" fill="{pocket}"/>
  <circle cx="682" cy="623" r="30" fill="{clasp}"/>'''

COLOR = dict(body='#FFFFFF', band='#E0E7FF', coin='#FBBF24', ring='#F59E0B', pocket='#C7D2FE', clasp='#4F46E5')
def svg(inner, w=1024, h=1024, box='0 0 1024 1024'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{box}">{inner}\n</svg>\n'
def scaled(s, inner):
    return f'<g transform="translate(512 512) scale({s}) translate(-526 -512)">{inner}\n</g>'

open('full.svg','w').write(svg('<rect x="0" y="0" width="1024" height="1024" fill="#4F46E5"/>' + scaled(1.05, mark(**COLOR))))
open('fg.svg','w').write(svg(scaled(0.72, mark(**COLOR))))
open('splash.svg','w').write(svg(mark(**COLOR), 640, 620, '190 200 680 660'))
