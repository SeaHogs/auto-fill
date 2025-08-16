#!/usr/bin/env python3
"""Simple Flask-based proxy for AutoFill's remote LLM feature.

Run:
    AF_LLM_URL=https://example.com/chat AF_LLM_API_KEY=sk-... python llm_proxy.py

Set the extension's LLM base URL to http://localhost:5000/query and leave the API key blank.
This server forwards prompts to the real LLM and returns the answer.
"""
import os
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

LLM_URL = os.environ.get("AF_LLM_URL", "")
API_KEY = os.environ.get("AF_LLM_API_KEY", "")

@app.post("/query")
def query():
    data = request.get_json(force=True)
    prompt = data.get("prompt", "")
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"
    resp = requests.post(LLM_URL, headers=headers, json={"prompt": prompt})
    try:
        payload = resp.json()
    except ValueError:
        return jsonify({"answer": ""}), 500
    answer = (
        payload.get("answer")
        or payload.get("result")
        or (payload.get("choices") or [{}])[0].get("text")
        or ""
    )
    return jsonify({"answer": answer})

if __name__ == "__main__":
    app.run(port=5000)
