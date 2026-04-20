<?php
// api.php - Main API Router
require_once 'config.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];
$route = $_GET['route'] ?? '';
$input = json_decode(file_get_contents('php://input'), true);

switch ($route) {
    case 'auth/login':
        if ($method !== 'POST') break;
        $username = $input['username'] ?? '';
        $password = $input['password'] ?? '';
        $role = $input['role'] ?? null;
        
        $res = supabase_request('GET', '/rest/v1/users?username=eq.' . urlencode($username) . '&select=*');
        if ($res['status'] !== 200 || empty($res['data'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Identifiant ou mot de passe incorrect']);
            exit;
        }
        
        $user = $res['data'][0];
        if ($role && $user['role'] !== $role) {
            http_response_code(401);
            echo json_encode(['error' => 'Rôle incorrect']);
            exit;
        }
        
        // In PHP, we use password_verify. 
        // Note: The hashes I generated earlier with node's bcrypt are compatible with PHP's password_verify if the salt format is standard.
        if (!password_verify($password, $user['password'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Identifiant ou mot de passe incorrect']);
            exit;
        }
        
        $payload = [
            'id' => $user['id'],
            'username' => $user['username'],
            'role' => $user['role'],
            'exp' => time() + (8 * 3600)
        ];
        $token = create_jwt($payload);
        echo json_encode(['token' => $token, 'user' => ['id' => $user['id'], 'username' => $user['username'], 'role' => $user['role']]]);
        exit;

    case 'auth/users':
        $user = validate_jwt();
        if ($user['role'] !== 'admin') {
            http_response_code(403);
            exit;
        }
        $res = supabase_request('GET', '/rest/v1/users?select=id,username,role,created_at');
        echo json_encode($res['data']);
        exit;

    case 'auth/change-password':
        $user = validate_jwt();
        if ($user['role'] !== 'admin' || $method !== 'POST') {
            http_response_code(403);
            exit;
        }
        $target = $input['targetUsername'];
        $newPass = $input['newPassword'];
        $hash = password_hash($newPass, PASSWORD_BCRYPT);
        
        $res = supabase_request('PATCH', '/rest/v1/users?username=eq.' . urlencode($target), [
            'password' => $hash,
            'updated_at' => date('c')
        ]);
        echo json_encode(['success' => true]);
        exit;

    case 'stock':
        $user = validate_jwt();
        if ($method === 'GET') {
            $cat = $_GET['category'] ?? '';
            $path = '/rest/v1/stock?select=*&order=category.asc,ref.asc';
            if ($cat) $path .= '&category=eq.' . urlencode($cat);
            $res = supabase_request('GET', $path);
            echo json_encode($res['data']);
        } elseif ($method === 'POST') {
            if ($user['role'] !== 'admin') { http_response_code(403); exit; }
            $id = $input['id'] ?? ('s' . round(microtime(true) * 1000));
            $data = [
                'id' => $id,
                'ref' => $input['ref'],
                'name' => $input['name'],
                'category' => $input['category'] ?? 'Bureautique',
                'qty' => $input['qty'] ?? 0,
                'price' => $input['price'] ?? 0,
                'threshold' => $input['threshold'] ?? 5,
                'updated_at' => date('c')
            ];
            // Upsert in Supabase REST API requires Prefer: resolution=merge (or similar)
            // But we can just use POST with Prefer: resolution=merge-duplicates (if supported)
            // Or just check if exists then PATCH or POST.
            // For simplicity, let's use the POST with the correct header for UPSERT.
            $ch = curl_init(SUPABASE_URL . '/rest/v1/stock');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'apikey: ' . SUPABASE_KEY,
                'Authorization: Bearer ' . SUPABASE_KEY,
                'Content-Type: application/json',
                'Prefer: resolution=merge-duplicates'
            ]);
            $response = curl_exec($ch);
            curl_close($ch);
            echo json_encode(['success' => true]);
        } elseif ($method === 'DELETE') {
            if ($user['role'] !== 'admin') { http_response_code(403); exit; }
            $id = $_GET['id'] ?? '';
            $res = supabase_request('DELETE', '/rest/v1/stock?id=eq.' . urlencode($id));
            echo json_encode(['success' => true]);
        }
        exit;

    case 'entries':
        $user = validate_jwt();
        if ($method === 'GET') {
            $date = $_GET['date'] ?? null;
            $from = $_GET['from'] ?? null;
            $to = $_GET['to'] ?? null;
            $path = '/rest/v1/entries?select=*&order=date.desc,created_at.desc&limit=500';
            if ($date) $path .= '&date=eq.' . urlencode($date);
            elseif ($from && $to) $path .= '&date=gte.' . urlencode($from) . '&date=lte.' . urlencode($to);
            $res = supabase_request('GET', $path);
            echo json_encode($res['data']);
        } elseif ($method === 'POST') {
            // Processing sale via RPC
            $res = supabase_request('POST', '/rest/v1/rpc/process_sale', [
                'p_date' => $input['date'],
                'p_article' => $input['article'],
                'p_qty' => (int)$input['qty'],
                'p_price' => (float)$input['price'],
                'p_total' => (float)($input['total'] ?? ($input['qty'] * $input['price'])),
                'p_stock_id' => $input['stock_id'] ?? null,
                'p_client_name' => $input['client_name'] ?? null,
                'p_client_phone' => $input['client_phone'] ?? null
            ]);
            if ($res['status'] >= 400) {
                http_response_code($res['status']);
                echo json_encode($res['data']);
            } else {
                echo json_encode(['success' => true, 'id' => $res['data']]);
            }
        } elseif ($method === 'DELETE') {
            $id = $_GET['id'] ?? '';
            $res = supabase_request('DELETE', '/rest/v1/entries?id=eq.' . urlencode($id));
            echo json_encode(['success' => true]);
        }
        exit;

    case 'expenses':
        $user = validate_jwt();
        if ($method === 'GET') {
            $date = $_GET['date'] ?? null;
            $from = $_GET['from'] ?? null;
            $to = $_GET['to'] ?? null;
            $path = '/rest/v1/expenses?select=*&order=date.desc,created_at.desc&limit=500';
            if ($date) $path .= '&date=eq.' . urlencode($date);
            elseif ($from && $to) $path .= '&date=gte.' . urlencode($from) . '&date=lte.' . urlencode($to);
            $res = supabase_request('GET', $path);
            echo json_encode($res['data']);
        } elseif ($method === 'POST') {
            $res = supabase_request('POST', '/rest/v1/expenses', [
                'date' => $input['date'],
                'motif' => $input['motif'],
                'amount' => (float)$input['amount'],
                'category' => $input['category'] ?? 'Autre'
            ]);
            echo json_encode(['success' => true]);
        } elseif ($method === 'DELETE') {
            $id = $_GET['id'] ?? '';
            $res = supabase_request('DELETE', '/rest/v1/expenses?id=eq.' . urlencode($id));
            echo json_encode(['success' => true]);
        }
        exit;

    case 'bilan/daily':
        $user = validate_jwt();
        if ($user['role'] !== 'admin') { http_response_code(403); exit; }
        $date = $_GET['date'] ?? '';
        $resEntries = supabase_request('GET', '/rest/v1/entries?select=total&date=eq.' . urlencode($date));
        $resExpenses = supabase_request('GET', '/rest/v1/expenses?select=amount&date=eq.' . urlencode($date));
        
        $totalIn = array_reduce($resEntries['data'] ?? [], function($s, $e){ return $s + $e['total']; }, 0);
        $totalOut = array_reduce($resExpenses['data'] ?? [], function($s, $e){ return $s + $e['amount']; }, 0);
        
        echo json_encode(['date' => $date, 'totalIn' => $totalIn, 'totalOut' => $totalOut, 'bilan' => $totalIn - $totalOut]);
        exit;

    case 'clients':
        $user = validate_jwt();
        if ($method === 'GET') {
            $res = supabase_request('GET', '/rest/v1/clients?select=*&order=name.asc');
            echo json_encode($res['data']);
        } elseif ($method === 'POST') {
            $data = [
                'name' => $input['name'],
                'phone' => $input['phone'] ?? null,
                'email' => $input['email'] ?? null
            ];
            // Upsert on phone
            $ch = curl_init(SUPABASE_URL . '/rest/v1/clients');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'apikey: ' . SUPABASE_KEY,
                'Authorization: Bearer ' . SUPABASE_KEY,
                'Content-Type: application/json',
                'Prefer: resolution=merge-duplicates'
            ]);
            curl_exec($ch);
            curl_close($ch);
            echo json_encode(['success' => true]);
        }
        exit;
}

http_response_code(404);
echo json_encode(['error' => 'Route non trouvée']);
