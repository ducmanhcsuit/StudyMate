@echo off
rem PoC buoc 2: embedding Gemini + Hit@k + nguong cosine. TON QUOTA GEMINI (2 request moi lan chay).
rem Can GEMINI_API_KEY trong ai\.env.
setlocal
set SLIDES=%~dp0..\..\..\slides
pushd "%~dp0.."
uv run --env-file .env python poc/embed_check.py poc/questions.jsonl "%SLIDES%" 
popd
