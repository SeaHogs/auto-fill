#!/usr/bin/env python3
"""Simple HTTP server exposing meta-llama/Llama-3.2-1B for local generation.

This script loads the 1B parameter Llama 3.2 model from Hugging Face and
provides an endpoint compatible with the extension's local LLM config.  The
server accepts POST requests at `/api/generate` with a JSON body containing a
`prompt` field and returns the generated text in the `response` field, mimicking
the behaviour of Ollama's API.

The endpoint can be tested with:

```
curl -X POST http://localhost:11434/api/generate \
     -H 'Content-Type: application/json' \
     -d '{"model": "llama3:1b", "prompt": "Hello"}'
```
"""
from __future__ import annotations

from flask import Flask, jsonify, request
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

MODEL_NAME = "meta-llama/Llama-3.2-1B"

# Load tokenizer and model once at startup.
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForCausalLM.from_pretrained(MODEL_NAME)
model.eval()

app = Flask(__name__)

@app.post("/api/generate")
def generate():
    data = request.get_json(force=True)
    prompt = data.get("prompt", "")
    max_new_tokens = data.get("max_new_tokens", 128)

    inputs = tokenizer(prompt, return_tensors="pt")
    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=True,
            temperature=0.7,
        )
    text = tokenizer.decode(output_ids[0], skip_special_tokens=True)
    # Return only the newly generated text after the prompt for clarity.
    generated = text[len(prompt):]
    return jsonify({"response": generated})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=11434)
