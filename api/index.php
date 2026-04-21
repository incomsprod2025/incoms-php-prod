<?php
// Router central pour Vercel
$request_uri = $_SERVER['REQUEST_URI'] ?? '/';

// Si la requête commence par /api/, on charge le backend
if (strpos($request_uri, '/api/') === 0) {
    require_once __DIR__ . '/../backend-php/api.php';
} else {
    // Sinon, on sert le frontend
    $html_path = __DIR__ . '/../frontend/public/index.html';
    if (file_exists($html_path)) {
        require_once $html_path;
    } else {
        echo "Frontend not found at " . $html_path;
    }
}
