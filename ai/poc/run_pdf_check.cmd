@echo off
rem PoC buoc 1: doc slide bang PyMuPDF, khong goi API.
rem Slide de ngoai repo, o SE347\slides (canh thu muc Project).
setlocal
set SLIDES=%~dp0..\..\..\slides
pushd "%~dp0.."
uv run python poc/pdf_check.py "%SLIDES%" 
popd
