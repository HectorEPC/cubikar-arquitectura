@echo off
title Subir Cubikar Arquitectura a GitHub
cls
echo ====================================================
echo      SUBIENDO CUBIKAR ARQUITECTURA A GITHUB
echo ====================================================
echo.
echo Conectando con https://github.com/HectorEPC/cubikar-arquitectura ...
echo.
git push -u origin main
if %ERRORLEVEL% equ 0 (
    echo.
    echo ====================================================
    echo    EXITO: Cubikar Arquitectura se subio correctamente.
    echo ====================================================
    echo Cloudflare Pages actualizara automaticamente el despliegue en produccion.
) else (
    echo.
    echo ====================================================
    echo    Hubo un problema al subir. Revisa tu conexion
    echo    o verifica que el repositorio en GitHub exista.
    echo ====================================================
)
echo.
pause
