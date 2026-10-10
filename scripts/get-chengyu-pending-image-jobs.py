"""Read a bounded queue of unfinished story pages; never mutates or calls providers."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--book', required=True)
parser.add_argument('--limit', type=int, default=4)
args = parser.parse_args()
if not 1 <= args.limit <= 20:
    raise SystemExit('Limit must be between 1 and 20')
folder = Path('content-drafts/chengyu')
kits = json.loads((folder / 'chengyu-81-90-image-prompts.json').read_text())
manifest = json.loads((folder / 'chengyu-81-90-image-generation.json').read_text())
book = next((item for item in kits['books'] if item['bookId'] == args.book), None)
if book is None:
    raise SystemExit('Unknown book')
reference = book.get('characterReference') or book['coverReference']
if not reference or not Path(reference).is_file():
    raise SystemExit('Missing reviewed identity reference')
finished = {row['page'] for row in manifest['images'] if row['bookId'] == args.book and
            row['kind'] == 'page' and row.get('active') is not False and Path(row['workspacePath']).is_file()}
jobs = [page for page in book['pages'] if page['page'] not in finished][:args.limit]
texts = json.loads((folder / 'chengyu-81-90.json').read_text())
draft = next(item for item in texts if item['id'] == args.book)
for job in jobs:
    source = draft['pages'][job['page'] - 1]
    cast = source['castCodes']
    job['prompt'] = '\n'.join([
        'Use case: illustration-story',
        f"Asset type: finished full-scene story illustration for {book['title']}, page {job['page']}.",
        'Primary request: ' + source['prompt'],
        'Narrative context (never print it): ' + source['en'],
        'Exact visible cast, each person once: ' + '; '.join(book['characterSpecs'][code] for code in cast),
        'Place the action in a complete ancient Chinese setting with period-appropriate architecture, materials and objects. Use the specific location and object state in the primary request. Do not introduce the locations or props from later pages.',
        'Reference role: use the attached character sheet ONLY for faces, hair and exact clothing. The scene must have entirely new natural poses and rich full-bleed foreground, middle ground and background. Never copy the plain studio background or character lineup.',
        'Style: ' + kits['globalStyle'],
        'Composition: square, one coherent edge-to-edge illustrated scene, natural cinematic lighting, detailed environment and storytelling actions, no blank space.',
        'Avoid: ' + kits['negative'],
        'Only the visible cast listed above. Exclude every other person in the character reference and do not add unlisted people, distant crowds, animal characters, text, panels or labels.',
    ])
    if args.book == 'qi-xin-xie-li' and job['page'] < 10:
        job['prompt'] += '\nStage state: red curtains and paper-flower garlands have NOT been hung. No completed decorated stage.'
    if args.book == 'yin-di-zhi-yi' and job['page'] < 16:
        job['prompt'] += '\nGarden state: NO yellow chrysanthemum flowers and NO lilac hosta flowers. Beds are bare until planting is specifically requested, then contain only young green seedlings.'
    if args.book == 'yin-di-zhi-yi' and job['page'] >= 16:
        job['prompt'] += '\nGarden continuity: exactly three plant types only: blooming yellow chrysanthemums in the sunny wall-side bed, tall leafy mint beside the large clay water jar, and broad-leaf hostas with pale lilac flower stalks under partial tree shade. No cabbage, scallions, tomatoes, beans or vegetable garden.'
    if args.book == 'ju-yi-fan-san' and job['page'] >= 7:
        job['prompt'] += '\nDelivery continuity: the two books have already been delivered and are absent from the foreground worktable. Show only the bundle, basket, mat or cord requested for this page; background shelves may remain.'
    if args.book == 'ju-yi-fan-san' and job['page'] <= 6:
        job['prompt'] += '\nBook continuity: exactly TWO blue clothbound books only, never a stack of three or four books. No additional foreground books.'
    if args.book == 'ju-yi-fan-san' and job['page'] not in (13, 14):
        job['prompt'] += '\nCord continuity: a thin ROUND cylindrical braided cotton cord, not a wide flat ribbon, strip of cloth or belt. The blue cord should match the first demonstration.'
    if args.book == 'ju-yi-fan-san' and 7 <= job['page'] <= 10:
        job['prompt'] += '\nBundle state: the yellow cloth corners are loose, merely overlapped. NO tied yellow knot and NO completed bow in the cloth. The blue cord is still separate and untied until page 11.'
    if args.book == 'you-bei-wu-huan':
        if job['page'] < 6:
            job['prompt'] += '\nPreparation state: umbrella is absent; do not introduce it yet.'
        elif 7 <= job['page'] <= 13 or job['page'] >= 16:
            job['prompt'] += '\nUmbrella state: oilpaper umbrella is FOLDED and closed, never an open canopy in this scene.'
        if job['page'] < 9:
            job['prompt'] += '\nBundle state: no tied red bundle yet. When the red cloth is requested it lies OPEN and flat, with no completed knot.'
        if job['page'] < 10:
            job['prompt'] += '\nSatchel state: any tan satchel in the reference is a prop, not permanent clothing; it rests on a bench and mother does not wear it yet.'
        if job['page'] < 13:
            job['prompt'] += '\nWeather state: dry scene, no rain falling yet. Cloud observation is allowed when requested.'
        if job['page'] < 15:
            job['prompt'] += '\nGrandmother is absent; only the child and mother are present.'
    if args.book == 'xun-xu-jian-jin':
        if 5 <= job['page'] <= 10:
            job['prompt'] += '\nLearning state: the child is practicing individual marks, branches or stones as requested, and has NOT completed her own landscape yet. The main practice sheet must show only the requested practice, never a complete landscape. An earlier crowded attempt may lie aside only when requested.'
        if 11 <= job['page'] <= 13:
            job['prompt'] += '\nLocation state: the girl and teacher are outside in the level courtyard observing the real hills. No study table, paper sheets or painting activity in the foreground.'
        if job['page'] >= 14:
            job['prompt'] += '\nComposition continuity: the child\'s new landscape uses low distant hills, one nearby tree, two rounded stones, and a clear winding stream path. No lettering, seals, signatures or calligraphy.'
    if args.book == 'jing-yi-qiu-jing':
        job['prompt'] += '\nExact kite identity on every page: ONE intact turquoise-blue DIAMOND-SHAPED paper kite, slim bamboo cross-frame, ONE cream cloth tail with exactly THREE small red bow tabs. A warm-yellow wooden line reel. No different kite shape, no patterned replacement and no extra kites.'
        if job['page'] < 9:
            job['prompt'] += '\nBefore the first improvement, one red tail bow is slightly crooked. Do not show any new tools or repaired parts yet.'
    if args.book == 'shi-jin-bu-mei':
        if job['page'] < 3 or job['page'] > 16:
            job['prompt'] += '\nMoney bag is completely ABSENT in this scene.'
        elif job['page'] < 13:
            job['prompt'] += '\nMoney bag front is plain plum-purple with a tan drawstring; NO crescent patch, NO coins or open bag visible. Its distinguishing mark is still hidden.'
        else:
            job['prompt'] += '\nMoney bag: plum-purple cloth, tan drawstring and a small pale crescent-shaped cloth patch; closed, no coins visible.'
print(json.dumps({'book': args.book, 'title': book['title'], 'total': len(book['pages']), 'saved': len(finished),
                  'reference': str(Path(reference).resolve()), 'jobs': jobs}, ensure_ascii=False))
