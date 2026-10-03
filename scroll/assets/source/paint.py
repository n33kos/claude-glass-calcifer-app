import os, sys, urllib.request, replicate
for line in open(os.path.expanduser('~/PixlSplice/.env')):
    if line.startswith('REPLICATE_API_TOKEN='): os.environ['REPLICATE_API_TOKEN'] = line.split('=',1)[1].strip().strip('"\'')
ref = open(os.path.expanduser('~/claude-glass-calcifer-app/assets/hearth-bare.jpg'), 'rb')
prompt = ("A single tall vertical unrolled parchment scroll, seen straight on and centered, with a round dark wooden roller "
  "across the top and another across the bottom, turned wooden knob caps at both ends of each roller. The paper between them is "
  "completely blank, warm aged cream parchment with soft stains, faint fibers and slightly ragged side edges, evenly lit, flat, no "
  "writing, no text, no symbols. Painted in exactly the same style as the reference image: hand-drawn dark brown ink outlines, "
  "painterly gouache shading, muted warm Ghibli-like palette. The scroll is isolated on a perfectly flat solid pure green (#00FF00) "
  "background, no shadow on the background, nothing else in the frame.")
out = replicate.run("google/nano-banana", input={"prompt": prompt, "image_input": [ref], "aspect_ratio": "2:3", "output_format": "png"})
url = out.url if hasattr(out, 'url') else (out[0] if isinstance(out, list) else str(out))
url = url() if callable(url) else url
urllib.request.urlretrieve(str(url), sys.argv[1]); print('saved', sys.argv[1])
