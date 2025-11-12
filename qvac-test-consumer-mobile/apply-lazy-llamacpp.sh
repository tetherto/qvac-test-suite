#!/bin/bash
set -e
echo "Applying LLM/Embeddings lazy loading..."

FILE="node_modules/@tetherto/sdk-fix-openclv1/dist/server/bare/addons/llamacpp/create-model.js"

# Add lazy imports
sed -i.bak '1s/^import LlmLlamacpp.*/import { Readable } from "bare-stream";\
\
let LlmLlamacpp = null;\
let EmbedLlamacpp = null;\
\
async function getLlmLlamacpp() {\
    if (!LlmLlamacpp) {\
        const mod = await import("@tetherto\/llm-llamacpp");\
        LlmLlamacpp = mod.default;\
    }\
    return LlmLlamacpp;\
}\
\
async function getEmbedLlamacpp() {\
    if (!EmbedLlamacpp) {\
        const mod = await import("@qvac\/embed-llamacpp");\
        EmbedLlamacpp = mod.default;\
    }\
    return EmbedLlamacpp;\
}/' "$FILE"

# Remove old imports
sed -i.bak '/^import EmbedLlamacpp/d' "$FILE"

# Make functions async and use lazy classes
sed -i.bak 's/^export function createLlmModel/export async function createLlmModel/' "$FILE"
sed -i.bak 's/^export function createEmbeddingsModel/export async function createEmbeddingsModel/' "$FILE"

# Add await for lazy loading
sed -i.bak 's/export async function createLlmModel(modelId, modelPath, llmConfig, projectionModelPath) {/export async function createLlmModel(modelId, modelPath, llmConfig, projectionModelPath) {\
    const LlmClass = await getLlmLlamacpp();/' "$FILE"

sed -i.bak 's/export async function createEmbeddingsModel(modelId, modelPath, embedConfig) {/export async function createEmbeddingsModel(modelId, modelPath, embedConfig) {\
    const EmbedClass = await getEmbedLlamacpp();/' "$FILE"

# Replace class usage
sed -i.bak 's/new LlmLlamacpp(/new LlmClass(/g' "$FILE"
sed -i.bak 's/new EmbedLlamacpp(/new EmbedClass(/g' "$FILE"

rm -f "$FILE.bak"
echo "✅ LLM/Embeddings lazy loading applied"

