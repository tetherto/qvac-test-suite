# Test Data Integration Plan
**Date:** October 22, 2025  
**Source:** `C:\Tether\Testdata`  
**Status:** Ready to Implement

---

## 🎯 Objective

Integrate comprehensive test data from `C:\Tether\Testdata` to enhance test coverage with:
- Real-world documents for RAG tests
- Images for future Multimodal tests
- Edge cases (corrupted files, unicode filenames)
- Various file formats and sizes

---

## 📊 Available Test Data

### ✅ **Immediately Usable**

#### 1. **Documents for RAG Tests** (`01_documents/`)
| File | Size | Use Case |
|------|------|----------|
| `desert_adventure_story_large.txt` | 32 KB | Large document chunking |
| `mountain_hiking_guide_large.txt` | 10 KB | Medium document chunking |
| `ocean_waves_poem_small.txt` | 0.26 KB | Small document handling |
| `sunset_beach_report_small.txt` | 0.34 KB | Basic RAG test |
| `sunset_beach_report_corrupted.txt` | 0.72 KB | Error handling |
| `sünšët_bëäch_rëpört_♠wëīrd♦.txt` | 0.78 KB | Unicode filename test |

**Proposed Tests:**
- ✅ `rag-large-document` - Test 32KB document chunking
- ✅ `rag-medium-document` - Test 10KB document chunking  
- ✅ `rag-unicode-filename` - Test Unicode filename handling
- ✅ `rag-corrupted-document` - Test corrupted file error handling
- ✅ `rag-semantic-search` - Test retrieval from chunked documents

#### 2. **Code Files for Embedding Tests** (`08_code/`)
| File | Size | Use Case |
|------|------|----------|
| `data_analysis_weather_small.py` | ~1-2 KB | Code embedding |
| `interactive_gallery_script_small.js` | ~1-2 KB | Code embedding |
| `api_response_users_small.json` | ~1 KB | JSON embedding |
| `calculator_app_basic_small.java` | ~1-2 KB | Code embedding |
| `portfolio_website_home_small.html` | ~1 KB | HTML embedding |

**Proposed Tests:**
- ✅ `embed-python-code` - Python code snippet embedding
- ✅ `embed-javascript-code` - JavaScript code embedding
- ✅ `embed-json-data` - JSON data embedding
- ✅ `embed-html-content` - HTML content embedding

#### 3. **Audio for Transcription Tests** (`05_audio/`)
| File | Format | Use Case |
|------|--------|----------|
| `classical_symphony_piece_small.mp3` | MP3 | Music-only (no speech) |
| `jazz_piano_evening_small.mp3` | MP3 | Music-only (no speech) |
| `ocean_waves_ambient_small.wav` | WAV | Ambient sound (no speech) |
| `classical_symphony_piece_corrupted.mp3` | MP3 | Corrupted audio handling |

**Proposed Tests:**
- ✅ `transcription-music-only-classical` - Verify no hallucinated text
- ✅ `transcription-ambient-ocean-waves` - Verify minimal/no output
- ✅ `transcription-corrupted-mp3-v2` - Enhanced corrupted audio test

---

### 🔮 **Future Use (When SDK Supports)**

#### 4. **Images for Multimodal Tests** (`04_images/`)
| File | Size | Format | Use Case |
|------|------|--------|----------|
| `sunflower_field_sunset_small.jpg` | 0.98 KB | JPG | Basic image description |
| `sunflower_field_sunset_large.jpg` | 2.94 KB | JPG | Larger image handling |
| `mountain_lake_reflection_small.png` | 1.03 KB | PNG | PNG format support |
| `mountain_lake_reflection_large.png` | 4.94 KB | PNG | Large PNG handling |
| `vintage_car_classic_small.bmp` | 0.35 KB | BMP | BMP format support |
| `dancing_cat_animation_small.gif` | 0.13 KB | GIF | GIF format support |
| `geometric_pattern_design_small.svg` | 1.19 KB | SVG | SVG format support |
| `geometric_pattern_design_corrupted.svg` | - | SVG | Corrupted image handling |
| `möüntäïn_läkë_rëflëctïön_wëïrd.png` | - | PNG | Unicode filename test |

**Proposed Tests (When Multimodal Available):**
- ⏳ `multimodal-image-description-jpg` - Describe sunflower field image
- ⏳ `multimodal-image-description-png` - Describe mountain lake image
- ⏳ `multimodal-format-bmp` - Test BMP format support
- ⏳ `multimodal-format-gif` - Test GIF format support
- ⏳ `multimodal-corrupted-image` - Test error handling
- ⏳ `multimodal-unicode-filename` - Test Unicode filename support
- ⏳ `multimodal-image-size-small` - Test small image (< 1 KB)
- ⏳ `multimodal-image-size-large` - Test larger image (~5 KB)

---

## 🚀 Implementation Plan

### **Phase 1: Enhanced RAG Tests** (IMMEDIATE)
**Priority:** HIGH  
**Estimated Time:** 2-3 hours  
**Tests to Add:** 5-8 new tests

**Steps:**
1. ✅ Copy document files to `shared-test-data/documents/`
2. ✅ Add RAG test builders in `test-builders.ts`:
   - `buildRagLargeDocumentTest()` - 32KB document
   - `buildRagMediumDocumentTest()` - 10KB document
   - `buildRagUnicodeFilenameTest()` - Unicode filename
   - `buildRagCorruptedDocumentTest()` - Error handling
   - `buildRagSemanticSearchTest()` - Retrieval test
3. ✅ Implement test executors in both consumers
4. ✅ Run and verify tests
5. ✅ Update documentation

**Expected Impact:** +5-8 tests, improve RAG coverage to ~95%

---

### **Phase 2: Enhanced Embedding Tests** (IMMEDIATE)
**Priority:** MEDIUM  
**Estimated Time:** 1-2 hours  
**Tests to Add:** 4 new tests

**Steps:**
1. ✅ Copy code files to `shared-test-data/code/`
2. ✅ Add embedding test builders:
   - `buildEmbedPythonCodeTest()` - Python code
   - `buildEmbedJavaScriptCodeTest()` - JavaScript code
   - `buildEmbedJsonDataTest()` - JSON data
   - `buildEmbedHtmlContentTest()` - HTML content
3. ✅ Implement test executors
4. ✅ Run and verify tests

**Expected Impact:** +4 tests, embeddings remain at 100% pass rate

---

### **Phase 3: Enhanced Transcription Tests** (IMMEDIATE)
**Priority:** MEDIUM  
**Estimated Time:** 1 hour  
**Tests to Add:** 3 new tests

**Steps:**
1. ✅ Copy audio files to `shared-test-data/audio/`
2. ✅ Add transcription test builders:
   - `buildTranscriptionMusicOnlyTest()` - Classical symphony
   - `buildTranscriptionAmbientSoundTest()` - Ocean waves
   - `buildTranscriptionCorruptedMp3Test()` - Enhanced error test
3. ✅ Implement test executors
4. ✅ Run and verify tests

**Expected Impact:** +3 tests, better transcription edge case coverage

---

### **Phase 4: Multimodal Tests** (FUTURE - When SDK Supports)
**Priority:** LOW (SDK not ready)  
**Estimated Time:** 3-4 hours  
**Tests to Add:** 8 new tests

**Prerequisites:**
- SDK must export multimodal/vision API
- Need to verify supported image formats
- May need specific vision models

**Steps:**
1. ⏳ Verify SDK multimodal support
2. ⏳ Copy image files to `shared-test-data/images/`
3. ⏳ Add multimodal test builders
4. ⏳ Implement test executors
5. ⏳ Run and verify tests

**Expected Impact:** +8 tests, add new multimodal category

---

## 📈 Projected Test Growth

| Phase | Tests Added | Total Tests | New Pass Rate |
|-------|-------------|-------------|---------------|
| **Current** | - | 73 | 76.8% |
| **+ Enhanced RAG** | +5-8 | 78-81 | ~78% |
| **+ Enhanced Embeddings** | +4 | 82-85 | ~79% |
| **+ Enhanced Transcription** | +3 | 85-88 | ~80% |
| **+ Multimodal (Future)** | +8 | 93-96 | ~85% |

**Final Target:** 95+ tests with 85%+ pass rate

---

## 🔧 Implementation Details

### File Organization

```
shared-test-data/
├── audio/
│   ├── (existing audio files)
│   ├── classical_symphony_small.mp3       # NEW
│   ├── jazz_piano_small.mp3               # NEW
│   ├── ocean_waves_ambient.wav            # NEW
│   └── classical_symphony_corrupted.mp3   # NEW
├── documents/                              # NEW DIRECTORY
│   ├── desert_adventure_large.txt
│   ├── mountain_hiking_guide.txt
│   ├── ocean_waves_poem.txt
│   ├── sunset_beach_report.txt
│   ├── sunset_beach_corrupted.txt
│   └── sunset_beach_unicode.txt
├── code/                                   # NEW DIRECTORY
│   ├── data_analysis.py
│   ├── interactive_gallery.js
│   ├── api_response_users.json
│   ├── calculator_app.java
│   └── portfolio_website.html
└── images/                                 # FUTURE DIRECTORY
    ├── sunflower_field_small.jpg
    ├── sunflower_field_large.jpg
    ├── mountain_lake_small.png
    ├── mountain_lake_large.png
    └── ...
```

### Test ID Naming Convention

- **RAG:** `rag-{feature}-{detail}`
  - `rag-large-document-32kb`
  - `rag-semantic-search-retrieval`
  - `rag-unicode-filename`
  
- **Embedding:** `embed-{content-type}-{detail}`
  - `embed-python-code`
  - `embed-json-data`
  
- **Transcription:** `transcription-{type}-{detail}`
  - `transcription-music-only-classical`
  - `transcription-ambient-ocean-waves`
  
- **Multimodal:** `multimodal-{action}-{detail}` (Future)
  - `multimodal-describe-sunflower-jpg`
  - `multimodal-describe-mountain-png`

---

## ⚠️ Known Limitations & Considerations

1. **SDK Limitations:**
   - Multimodal API not yet available in SDK v0.2.6
   - Translation API not implemented
   - Some transcription bugs affect test reliability

2. **Test Data:**
   - Unicode filenames may cause issues on some systems
   - Corrupted files should fail gracefully
   - File sizes kept small (< 50 KB) for fast test execution

3. **Platform Differences:**
   - Desktop (Bare.js) and Mobile (React Native) may handle files differently
   - File path resolution differs between platforms
   - Some formats may not be supported on all platforms

---

## 📝 Next Actions

### Immediate (Today):
1. ✅ Copy relevant test data files to `shared-test-data/`
2. ✅ Implement Phase 1 (Enhanced RAG Tests)
3. ✅ Implement Phase 2 (Enhanced Embedding Tests)
4. ✅ Implement Phase 3 (Enhanced Transcription Tests)
5. ✅ Run complete test suite
6. ✅ Generate updated HTML report

### Short-term (This Week):
- Review test results and fix any failures
- Update documentation
- Get feedback from SDK team on multimodal roadmap

### Long-term (Next Sprint):
- Implement multimodal tests when SDK ready
- Add performance benchmarking tests
- Expand test coverage to 100+ tests

---

## 📞 Questions for SDK Team

1. **Multimodal:** When will multimodal/vision API be available?
2. **Image Formats:** What image formats will be supported? (JPG, PNG, BMP, GIF, SVG?)
3. **Image Size Limits:** What's the max image size for multimodal?
4. **Model Requirements:** Do we need specific vision models loaded?

---

**Created by:** QVAC Testing Team  
**Status:** Ready to implement  
**Next Step:** Phase 1 - Enhanced RAG Tests

