#!/usr/bin/env python3
"""Fetch UK Met Office warnings (via MeteoAlarm) and write a compact warnings.json for the app."""
import json, re, sys, urllib.request
from datetime import datetime, timezone

FEED = 'https://feeds.meteoalarm.org/api/v1/warnings/feeds-united-kingdom'
COLOURS = {'1': 'green', '2': 'yellow', '3': 'amber', '4': 'red'}


def param(info, name):
    for p in info.get('parameter', []):
        if p.get('valueName') == name:
            return p['value']
    return ''


def main(out):
    req = urllib.request.Request(FEED, headers={'User-Agent': 'weather-app-warnings/1.0'})
    data = json.load(urllib.request.urlopen(req, timeout=30))
    warnings = []
    for w in data.get('warnings', []):
        a = w['alert']
        if a.get('status') != 'Actual' or a.get('msgType') == 'Cancel':
            continue
        for info in a.get('info', []):
            if not info.get('language', 'en').startswith('en'):
                continue
            if info.get('expires') and info['expires'] < datetime.now(timezone.utc).isoformat():
                continue
            level = param(info, 'awareness_level').split(';')[0].strip()
            if COLOURS.get(level, 'green') == 'green':
                continue
            areas = []
            for ar in info.get('area', []):
                polys = [[[round(float(n), 3) for n in pt.split(',')] for pt in poly.split()] for poly in ar.get('polygon', [])]
                areas.append({'name': ar.get('areaDesc', ''), 'polygons': polys})
            desc = re.sub(r'\s*For further details see https?://\S+', '', info.get('description', '')).strip()
            warnings.append({
                'event': info.get('event', 'Weather warning'),
                'level': COLOURS[level],
                'headline': info.get('headline', ''),
                'description': desc,
                'impacts': [p['value'] for p in info.get('parameter', []) if p.get('valueName') == 'impacts'],
                'onset': info.get('onset') or a.get('sent'),
                'expires': info.get('expires'),
                'areas': areas,
                'web': info.get('web', ''),
            })
    # `updated` only changes when the warnings do, so the workflow doesn't commit for nothing
    try:
        old = json.load(open(out))
    except Exception:
        old = {}
    if old.get('warnings') == warnings:
        print('no change')
        return
    json.dump({'updated': datetime.now(timezone.utc).isoformat(timespec='minutes'), 'warnings': warnings},
              open(out, 'w'), separators=(',', ':'))
    print(f'wrote {len(warnings)} warnings')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'warnings.json')
