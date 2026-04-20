<?php
// Root index.php - Entry point for the PHP project
// Serves the frontend and handles routing if needed.

$request_uri = $_SERVER['REQUEST_URI'];

// Standard logic: if it's a file that exists, serve it
if (file_exists(__DIR__ . $request_uri) && !is_dir(__DIR__ . $request_uri)) {
    return false;
}

// Serve the frontend by default
require_once __DIR__ . '/frontend/public/index.html';
