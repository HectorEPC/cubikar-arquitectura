import re
from bs4 import BeautifulSoup

with open('honorarios.html', 'r', encoding='utf-8', errors='ignore') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

print("Title:", soup.title.string if soup.title else "No title")

# Print all form elements, selects, labels, inputs
selects = soup.find_all('select')
print(f"Found {len(selects)} select elements:")
for s in selects:
    print("SELECT ID/NAME:", s.get('id'), s.get('name'))
    options = s.find_all('option')
    for opt in options:
        print("  - ", opt.get('value'), ":", opt.get_text(strip=True))

inputs = soup.find_all('input')
print(f"\nFound {len(inputs)} input elements:")
for inp in inputs:
    print("INPUT:", inp.get('type'), inp.get('name'), inp.get('id'), inp.get('value'), inp.find_next_sibling(text=True) or "")

# Check scripts
scripts = soup.find_all('script')
print(f"\nFound {len(scripts)} scripts")
for i, sc in enumerate(scripts):
    src = sc.get('src')
    content = sc.string or ""
    print(f"Script {i}: src={src}, inline length={len(content)}")
    if not src and len(content) > 0:
        if any(k in content.lower() for k in ['proyecto', 'honorarios', 'colegio', 'alcance']):
            print("  Inline script snippet:", content[:300], "...")
