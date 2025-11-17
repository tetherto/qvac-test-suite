# Patch Testing Versions

To test which patches are necessary:

## Switch patches:
```bash
# Full patch (all lazy loading)
cp patch-full.patch @tetherto+sdk-fix-openclv1+1.0.0-tmp.runid-19260131899.patch
npm install

# No translation patch
cp patch-no-translation.patch @tetherto+sdk-fix-openclv1+1.0.0-tmp.runid-19260131899.patch  
npm install

# No whisper/translation patches
cp patch-no-whisper-translation.patch @tetherto+sdk-fix-openclv1+1.0.0-tmp.runid-19260131899.patch
npm install

# No patches
rm @tetherto+sdk-fix-openclv1+1.0.0-tmp.runid-19260131899.patch
npm install
```

## Test commands:
- Translation: `TEST_FILTER=translation`
- Transcription: `TEST_FILTER=transcription`
- LLM: `TEST_FILTER=llm` or `TEST_FILTER=completion`
- Embeddings: `TEST_FILTER=embed`

