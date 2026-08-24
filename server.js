// ============================================================
    // 1. IMPORTAR LIBRERÍAS
    // ============================================================
    const express = require('express');
    const axios = require('axios');
    const querystring = require('querystring');
    const cors = require('cors');
    const multer = require('multer');
    const { createClient } = require('@supabase/supabase-js');
    const jwt = require('jsonwebtoken');
    require('dotenv').config();

    const app = express();

    // ============================================================
    // CONFIGURACIÓN DE CORS (CORREGIDO PARA RENDER)
    // ============================================================
    app.use((req, res, next) => {
        const allowedOrigins = [
            'https://courageous-biscochitos-8c3cca.netlify.app',
            'https://*.netlify.app',
            'https://soul-frontend-nine.vercel.app', // 🔥 URL EXACTA DE VERCEL
            'https://*.vercel.app', // 🔥 Permite TODAS las URLs de Vercel
            'http://127.0.0.1:3000',
            'http://localhost:3000'
        ];
        
        const origin = req.headers.origin;
        
        // Si el origen está en la lista, permitirlo. Si NO, usar '*' temporalmente
        if (origin && (allowedOrigins.includes(origin) || origin.includes('vercel.app') || origin.includes('netlify.app'))) {
            res.header('Access-Control-Allow-Origin', origin);
        } else {
            res.header('Access-Control-Allow-Origin', '*');
        }
        
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Credentials', 'true');
        
        if (req.method === 'OPTIONS') {
            return res.status(200).json({});
        }
        next();
    });
    app.use(express.json());
    app.use(cors());

    // ============================================================
    // 3. CONFIGURACIÓN DE ENTORNO
    // ============================================================
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const JWT_SECRET = process.env.JWT_SECRET;

    console.log('🔑 JWT_SECRET cargado:', JWT_SECRET ? '✅ Sí' : '❌ No');
    console.log('🔑 SUPABASE_URL cargado:', SUPABASE_URL ? '✅ Sí' : '❌ No');
    console.log('🔑 SUPABASE_ANON_KEY cargado:', SUPABASE_ANON_KEY ? '✅ Sí' : '❌ No');

    const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Spotify
    const spotifyClientId = 'fed9178fa0784af6a1c611ac82c91f60';
    const spotifyClientSecret = '289897deab3b4d5e8957c61de046f8a8';
    const spotifyRedirectUri = 'https://soul-backend-hbdp.onrender.com/callback';

    // ============================================================
    // 4. RUTA DE PRUEBA
    // ============================================================
    app.get('/', (req, res) => {
        res.json({
            message: '🚀 SOUL API está funcionando',
            version: '1.0.0',
            endpoints: {
                test: '/test',
                ping: '/ping',
                auth: {
                    login: '/auth/login [POST]',
                    register: '/auth/register [POST]',
                    me: '/auth/me [GET]'
                },
                profile: '/profile [PUT]',
                spotify: {
                    connect: '/spotify/connect [GET]',
                    status: '/spotify/status [GET]',
                    currently_playing: '/currently-playing [GET]',
                    recent_tracks: '/recent-tracks [GET]',
                    top_artists: '/top-artists [GET]',
                    top_tracks: '/top-tracks [GET]',
                    playlists: '/playlists [GET]'
                }
            },
            status: 'online',
            timestamp: new Date().toISOString()
        });
    });

    // ============================================================
    // 5. FUNCIÓN AUXILIAR
    // ============================================================
    const generateRandomString = (length) => {
        let result = '';
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    };

    // ============================================================
    // 6. MIDDLEWARE: VERIFICAR TOKEN
    // ============================================================
    const verifyToken = (req, res, next) => {
        const authHeader = req.headers.authorization;
        console.log('🔍 Headers de autorización:', authHeader ? '✅ Presente' : '❌ Ausente');

        if (!authHeader) {
            console.log('❌ No hay header de autorización');
            return res.status(401).json({ error: 'No token' });
        }

        const token = authHeader.split(' ')[1];
        console.log('📝 Token recibido (primeros 30 chars):', token?.substring(0, 30) + '...');

        if (!token) {
            console.log('❌ No hay token en el header');
            return res.status(401).json({ error: 'No token' });
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            console.log('✅ Token válido para:', decoded.email);
            
            req.user = {
                id: decoded.userId,
                email: decoded.email
            };
            
            next();
        } catch (error) {
            console.error('❌ Error al verificar token:', error.message);
            
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expirado' });
            }
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({ error: 'Token inválido: ' + error.message });
            }
            
            res.status(401).json({ error: 'Error al verificar token' });
        }
    };

    // ============================================================
    // 7. AUTH: LOGIN
    // ============================================================
    app.post('/auth/login', async (req, res) => {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Faltan campos: email y password son requeridos' });
        }

        try {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) throw authError;

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('user_id', authData.user.id)
                .single();

            if (profileError && profileError.code !== 'PGRST116') throw profileError;

            const token = jwt.sign(
                {
                    userId: authData.user.id,
                    email: authData.user.email,
                    iat: Math.floor(Date.now() / 1000)
                },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            console.log('✅ Login exitoso para:', email);

            res.json({
                token: token,
                user: {
                    id: authData.user.id,
                    email: authData.user.email,
                    username: profile?.username || email,
                    bio: profile?.bio || '',
                    banner_url: profile?.banner_url || '',
                    avatar_url: profile?.avatar_url || '',
                    social_links: profile?.social_links || {},
                    spotify_connected: profile?.spotify_connected || false,
                }
            });

        } catch (error) {
            console.error('❌ Error en login:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================================
    // 8. AUTH: REGISTRO
    // ============================================================
    app.post('/auth/register', async (req, res) => {
        const { email, password, username } = req.body;

        if (!email || !password || !username) {
            return res.status(400).json({ error: 'Faltan campos: email, password y username son requeridos' });
        }

        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
            });

            if (authError) throw authError;

            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    user_id: authData.user.id,
                    username: username,
                    social_links: {},
                });

            if (profileError) throw profileError;

            const token = jwt.sign(
                {
                    userId: authData.user.id,
                    email: email,
                    iat: Math.floor(Date.now() / 1000)
                },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            console.log('✅ Registro exitoso para:', email);

            res.json({
                token: token,
                user: {
                    id: authData.user.id,
                    email,
                    username,
                }
            });

        } catch (error) {
            console.error('❌ Error en registro:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================================
    // 9. AUTH: OBTENER PERFIL
    // ============================================================
    app.get('/auth/me', verifyToken, async (req, res) => {
        try {
            console.log('🔍 Buscando perfil para usuario:', req.user.id);

            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('user_id', req.user.id)
                .maybeSingle();

            if (error) {
                console.error('❌ Error en Supabase:', error);
                throw error;
            }

            if (!profile) {
                console.log('⚠️ No se encontró perfil, creando uno por defecto...');
                
                const { data: newProfile, error: insertError } = await supabase
                    .from('profiles')
                    .insert({
                        user_id: req.user.id,
                        username: req.user.email?.split('@')[0] || 'user',
                        social_links: {},
                    })
                    .select()
                    .single();

                if (insertError) {
                    console.error('❌ Error al crear perfil:', insertError);
                    throw insertError;
                }

                console.log('✅ Perfil creado:', newProfile);
                
                return res.json({
                    id: req.user.id,
                    email: req.user.email,
                    username: newProfile.username,
                    bio: newProfile.bio || '',
                    banner_url: newProfile.banner_url || '',
                    avatar_url: newProfile.avatar_url || '',
                    social_links: newProfile.social_links || {},
                    spotify_connected: newProfile.spotify_connected || false,
                });
            }

            console.log('✅ Perfil encontrado:', profile);

            res.json({
                id: req.user.id,
                email: req.user.email,
                username: profile.username,
                bio: profile.bio || '',
                banner_url: profile.banner_url || '',
                avatar_url: profile.avatar_url || '',
                social_links: profile.social_links || {},
                spotify_connected: profile.spotify_connected || false,
            });

        } catch (error) {
            console.error('❌ Error en /auth/me:', error);
            res.status(500).json({ error: error.message });
        }
    });
    // ============================================================
    // PERFIL PÚBLICO (Para compartir sin login)
    // ============================================================
    app.get('/public-profile/:username', async (req, res) => {
        try {
            const username = req.params.username;
            
            // Buscar el perfil por username
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('username', username)
                .maybeSingle();

            if (error) throw error;

            if (!data) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            // Devolver datos públicos (sin tokens de Spotify)
            res.json({
                id: data.user_id,
                email: null, // No mostrar email
                username: data.username,
                bio: data.bio || '',
                banner_url: data.banner_url || '',
                avatar_url: data.avatar_url || '',
                social_links: data.social_links || {},
                spotify_connected: false // No mostrar datos privados de Spotify
            });
        } catch (error) {
            console.error('❌ Error en /public-profile:', error);
            res.status(500).json({ error: error.message });
        }
    });
    // ============================================================
    // 10. PERFIL: ACTUALIZAR
    // ============================================================
    app.put('/profile', verifyToken, async (req, res) => {
        const { username, bio, social_links } = req.body;

        try {
            const updates = {};
            if (username !== undefined) updates.username = username;
            if (bio !== undefined) updates.bio = bio;
            if (social_links !== undefined) updates.social_links = social_links;
            updates.updated_at = new Date();

            const { data, error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('user_id', req.user.id)
                .select()
                .single();

            if (error) throw error;

            res.json(data);

        } catch (error) {
            console.error('❌ Error al actualizar perfil:', error);
            res.status(500).json({ error: error.message });
        }
    });

        // ============================================================
    // 11. PERFIL: SUBIR IMAGEN
    // ============================================================
    const storage = multer.memoryStorage();
    const upload = multer({
        storage,
        limits: { 
            fileSize: 5 * 1024 * 1024,
            files: 1
        },
        fileFilter: (req, file, cb) => {
            const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
            if (allowedTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Tipo de archivo no soportado. Usa JPEG, PNG, GIF, WEBP o SVG.'), false);
            }
        }
    });

    app.post('/profile/upload', verifyToken, upload.single('image'), async (req, res) => {
        console.log('📤 Recibida solicitud de subida de imagen');
        console.log('📦 Body:', req.body);
        console.log('📦 File:', req.file ? '✅ Recibido' : '❌ No recibido');

        if (!req.file) {
            return res.status(400).json({ 
                error: 'No se subió ninguna imagen. Asegúrate de seleccionar un archivo.' 
            });
        }

        const type = req.body.type;
        if (!type || (type !== 'banner' && type !== 'avatar')) {
            return res.status(400).json({ 
                error: 'Tipo de imagen inválido. Usa "banner" o "avatar".' 
            });
        }

        try {
            const fileExt = req.file.originalname.split('.').pop();
            const fileName = `${req.user.id}_${Date.now()}.${fileExt}`;
            
            console.log(`📝 Subiendo ${type} con nombre: ${fileName}`);
            console.log(`📊 Tamaño: ${(req.file.size / 1024).toFixed(2)} KB`);
            console.log(`📊 Tipo: ${req.file.mimetype}`);

            const { error: uploadError } = await supabase.storage
                .from('images')
                .upload(fileName, req.file.buffer, {
                    contentType: req.file.mimetype,
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) {
                console.error('❌ Error al subir a Storage:', uploadError);
                throw new Error(`Error al subir la imagen: ${uploadError.message}`);
            }

            console.log('✅ Archivo subido exitosamente a Storage');

            const { data: urlData } = supabase.storage
                .from('images')
                .getPublicUrl(fileName);

            if (!urlData || !urlData.publicUrl) {
                throw new Error('No se pudo obtener la URL pública de la imagen');
            }

            const imageUrl = urlData.publicUrl;
            console.log('🔗 URL pública:', imageUrl);

            const updateField = type === 'banner' ? 'banner_url' : 'avatar_url';
            console.log(`📝 Actualizando campo: ${updateField}`);

            const { data: profile, error: updateError } = await supabase
                .from('profiles')
                .update({ 
                    [updateField]: imageUrl,
                    updated_at: new Date()
                })
                .eq('user_id', req.user.id)
                .select()
                .single();

            if (updateError) {
                console.error('❌ Error al actualizar perfil:', updateError);
                try {
                    await supabase.storage.from('images').remove([fileName]);
                    console.log('🗑️ Imagen eliminada por fallo en actualización');
                } catch (removeError) {
                    console.error('⚠️ Error al eliminar imagen:', removeError);
                }
                throw new Error(`Error al actualizar el perfil: ${updateError.message}`);
            }

            console.log('✅ Perfil actualizado exitosamente');
            console.log('✅ Imagen subida y perfil actualizado');

            res.json({ 
                success: true,
                url: imageUrl, 
                profile: profile,
                message: `${type} actualizado correctamente`
            });

        } catch (error) {
            console.error('❌ Error en /profile/upload:', error);
            
            let statusCode = 500;
            let errorMessage = error.message || 'Error al subir la imagen';
            
            if (error.message.includes('bucket')) {
                statusCode = 500;
                errorMessage = 'Error de configuración del almacenamiento. Contacta al administrador.';
            } else if (error.message.includes('tamaño') || error.message.includes('size')) {
                statusCode = 413;
                errorMessage = 'El archivo es demasiado grande. Máximo 5MB.';
            } else if (error.message.includes('tipo')) {
                statusCode = 415;
            }
            
            res.status(statusCode).json({ 
                error: errorMessage,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    });

    // ============================================================
    // SPOTIFY: CONECTAR
    // ============================================================
    app.get('/spotify/connect', verifyToken, (req, res) => {
        const state = req.user.id;
        const scope = 'user-read-currently-playing user-top-read user-read-private user-library-read user-library-modify playlist-read-private playlist-read-collaborative user-read-recently-played user-follow-read';

        const redirectUrl = 'https://accounts.spotify.com/authorize?' +
            querystring.stringify({
                response_type: 'code',
                client_id: spotifyClientId,
                scope: scope,
                redirect_uri: spotifyRedirectUri,
                state: state
            });

        res.json({ url: redirectUrl });
    });

    // ============================================================
    // SPOTIFY: DESCONECTAR (NUEVO)
    // ============================================================
    app.post('/spotify/disconnect', verifyToken, async (req, res) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    spotify_token: null,
                    spotify_refresh_token: null,
                    spotify_connected: false,
                    updated_at: new Date()
                })
                .eq('user_id', req.user.id);

            if (error) throw error;

            console.log('✅ Spotify desconectado para:', req.user.id);
            res.json({ success: true, message: 'Spotify desconectado' });
        } catch (error) {
            console.error('❌ Error al desconectar Spotify:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================================
    // SPOTIFY: CALLBACK
    // ============================================================
    app.get('/callback', async (req, res) => {
        const code = req.query.code;
        const userId = req.query.state;

        if (!code || !userId) {
            return res.status(400).send('Error: falta código o usuario');
        }

        try {
            const authOptions = {
                url: 'https://accounts.spotify.com/api/token',
                form: {
                    code: code,
                    redirect_uri: spotifyRedirectUri,
                    grant_type: 'authorization_code'
                },
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(spotifyClientId + ':' + spotifyClientSecret).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };

            const response = await axios.post(authOptions.url, querystring.stringify(authOptions.form), {
                headers: authOptions.headers
            });

            const access_token = response.data.access_token;
            const refresh_token = response.data.refresh_token;

            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    spotify_token: access_token,
                    spotify_refresh_token: refresh_token,
                    spotify_connected: true,
                    updated_at: new Date()
                })
                .eq('user_id', userId);

            if (updateError) throw updateError;

            res.redirect('https://courageous-biscochitos-8c3cca.netlify.app?spotify=connected');

        } catch (error) {
            console.error('❌ Error en callback Spotify:', error);
            res.status(500).send('Error al conectar Spotify: ' + error.message);
        }
    });

    // ============================================================
    // FUNCIÓN PARA REFRESCAR TOKEN DE SPOTIFY
    // ============================================================
    const refreshSpotifyToken = async (userId) => {
        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('spotify_refresh_token')
                .eq('user_id', userId)
                .single();

            if (error || !profile?.spotify_refresh_token) {
                throw new Error('No hay refresh token disponible');
            }

            const authOptions = {
                url: 'https://accounts.spotify.com/api/token',
                form: {
                    grant_type: 'refresh_token',
                    refresh_token: profile.spotify_refresh_token
                },
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(spotifyClientId + ':' + spotifyClientSecret).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };

            const response = await axios.post(authOptions.url, querystring.stringify(authOptions.form), {
                headers: authOptions.headers
            });

            const newAccessToken = response.data.access_token;

            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    spotify_token: newAccessToken,
                    updated_at: new Date()
                })
                .eq('user_id', userId);

            if (updateError) throw updateError;

            return newAccessToken;
        } catch (error) {
            console.error('❌ Error al refrescar token de Spotify:', error);
            throw error;
        }
    };

    // ============================================================
    // FUNCIÓN MEJORADA PARA OBTENER TOKEN DE SPOTIFY
    // ============================================================
    const getSpotifyToken = async (userId) => {
        try {
            console.log(`🔍 Buscando token de Spotify para usuario: ${userId}`);

            const { data: profile, error } = await supabase
                .from('profiles')
                .select('spotify_token, spotify_refresh_token, spotify_connected')
                .eq('user_id', userId)
                .single();

            if (error) {
                console.error('❌ Error al obtener perfil:', error);
                throw new Error(`Error al obtener perfil: ${error.message}`);
            }

            if (!profile) {
                console.error('❌ Perfil no encontrado para usuario:', userId);
                throw new Error('Perfil no encontrado');
            }

            console.log('📊 Perfil encontrado:', {
                spotify_connected: profile.spotify_connected,
                has_token: !!profile.spotify_token,
                has_refresh_token: !!profile.spotify_refresh_token
            });

            if (!profile.spotify_connected) {
                throw new Error('Spotify no está conectado');
            }

            if (!profile.spotify_token) {
                if (profile.spotify_refresh_token) {
                    console.log('🔄 Token ausente, intentando refrescar...');
                    const newToken = await refreshSpotifyToken(userId);
                    return newToken;
                }
                throw new Error('No hay token de Spotify disponible');
            }

            return profile.spotify_token;
        } catch (error) {
            console.error('❌ Error en getSpotifyToken:', error.message);
            throw error;
        }
    };

    // ============================================================
    // SPOTIFY REQUEST CON MANEJO DE ERRORES
    // ============================================================
    const spotifyRequest = async (userId, endpoint, params = {}) => {
        try {
            console.log(`📤 Haciendo request a Spotify: ${endpoint}`);
            
            let token;
            try {
                token = await getSpotifyToken(userId);
            } catch (error) {
                console.error('❌ Error al obtener token:', error.message);
                const err = new Error(error.message);
                err.status = 401;
                throw err;
            }

            try {
                const response = await axios.get(`https://api.spotify.com/v1${endpoint}`, {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    params: params,
                    timeout: 10000
                });
                return response.data;
            } catch (error) {
                console.error(`❌ Error en request a Spotify (${endpoint}):`, {
                    status: error.response?.status,
                    data: error.response?.data,
                    message: error.message
                });

                if (error.response?.status === 401) {
                    console.log('🔄 Token expirado, refrescando...');
                    try {
                        token = await refreshSpotifyToken(userId);
                        
                        const response = await axios.get(`https://api.spotify.com/v1${endpoint}`, {
                            headers: { 'Authorization': `Bearer ${token}` },
                            params: params,
                            timeout: 10000
                        });
                        return response.data;
                    } catch (refreshError) {
                        console.error('❌ Error al refrescar token:', refreshError.message);
                        const err = new Error('Error al refrescar token de Spotify');
                        err.status = 401;
                        throw err;
                    }
                }

                if (error.response?.status === 204) {
                    return { is_playing: false };
                }

                throw error;
            }
        } catch (error) {
            console.error(`❌ Error en spotifyRequest (${endpoint}):`, {
                message: error.message,
                status: error.status || error.response?.status
            });
            
            const err = new Error(error.message);
            err.status = error.status || error.response?.status || 500;
            throw err;
        }
    };

    // --- NOW PLAYING ---
    app.get('/currently-playing', verifyToken, async (req, res) => {
        try {
            const data = await spotifyRequest(req.user.id, '/me/player/currently-playing');
            res.json(data);
        } catch (error) {
            const status = error.status || error.response?.status || 500;
            console.error(`❌ Error en /currently-playing (${status}):`, error.message);
            
            if (status === 401) {
                return res.status(401).json({ 
                    error: 'Spotify no conectado o sesión expirada. Reconecta tu cuenta.',
                    needs_reconnect: true
                });
            }
            
            if (status === 204) {
                return res.json({ is_playing: false });
            }
            
            res.status(status).json({ 
                error: error.message || 'Error al obtener canción actual'
            });
        }
    });

    // --- RECENT TRACKS ---
    app.get('/recent-tracks', verifyToken, async (req, res) => {
        try {
            const data = await spotifyRequest(req.user.id, '/me/tracks', { limit: 6, offset: 0 });
            res.json(data);
        } catch (error) {
            const status = error.status || error.response?.status || 500;
            console.error(`❌ Error en /recent-tracks (${status}):`, error.message);
            
            if (status === 401) {
                return res.status(401).json({ 
                    error: 'Spotify no conectado o sesión expirada. Reconecta tu cuenta.',
                    needs_reconnect: true
                });
            }
            
            res.status(status).json({ 
                error: error.message || 'Error al obtener canciones recientes'
            });
        }
    });

    // --- TOP ARTISTS ---
    app.get('/top-artists', verifyToken, async (req, res) => {
        try {
            const data = await spotifyRequest(req.user.id, '/me/top/artists', { 
                time_range: 'short_term', 
                limit: 5 
            });
            res.json(data);
        } catch (error) {
            const status = error.status || error.response?.status || 500;
            console.error(`❌ Error en /top-artists (${status}):`, error.message);
            
            if (status === 401) {
                return res.status(401).json({ 
                    error: 'Spotify no conectado o sesión expirada. Reconecta tu cuenta.',
                    needs_reconnect: true
                });
            }
            
            res.status(status).json({ 
                error: error.message || 'Error al obtener top artistas'
            });
        }
    });

    // --- TOP TRACKS ---
    app.get('/top-tracks', verifyToken, async (req, res) => {
        try {
            const data = await spotifyRequest(req.user.id, '/me/top/tracks', { 
                time_range: 'short_term', 
                limit: 5 
            });
            res.json(data);
        } catch (error) {
            const status = error.status || error.response?.status || 500;
            console.error(`❌ Error en /top-tracks (${status}):`, error.message);
            
            if (status === 401) {
                return res.status(401).json({ 
                    error: 'Spotify no conectado o sesión expirada. Reconecta tu cuenta.',
                    needs_reconnect: true
                });
            }
            
            res.status(status).json({ 
                error: error.message || 'Error al obtener top tracks'
            });
        }
    });

    // ============================================================
    // SPOTIFY: FOLLOWING
    // ============================================================
    app.get('/following', verifyToken, async (req, res) => {
        try {
            const data = await spotifyRequest(req.user.id, '/me/following', { 
                type: 'artist', 
                limit: 20 
            });
            res.json(data);
        } catch (error) {
            const status = error.status || error.response?.status || 500;
            console.error(`❌ Error en /following (${status}):`, error.message);
            if (status === 401) {
                return res.status(401).json({ error: 'Spotify no conectado o sesión expirada.', needs_reconnect: true });
            }
            res.status(status).json({ error: error.message || 'Error al obtener artistas seguidos' });
        }
    });

    // ============================================================
    // SPOTIFY: SAVED ALBUMS
    // ============================================================
    app.get('/saved-albums', verifyToken, async (req, res) => {
        try {
            const data = await spotifyRequest(req.user.id, '/me/albums', { 
                limit: 20 
            });
            res.json(data);
        } catch (error) {
            const status = error.status || error.response?.status || 500;
            console.error(`❌ Error en /saved-albums (${status}):`, error.message);
            if (status === 401) {
                return res.status(401).json({ error: 'Spotify no conectado o sesión expirada.', needs_reconnect: true });
            }
            res.status(status).json({ error: error.message || 'Error al obtener álbumes guardados' });
        }
    });

    // --- PLAYLISTS (SOLO DEL USUARIO) ---
    app.get('/playlists', verifyToken, async (req, res) => {
        try {
            console.log('📤 Obteniendo playlists del usuario...');
            
            const userProfile = await spotifyRequest(req.user.id, '/me');
            const spotifyUserId = userProfile.id;
            console.log(`🔍 Usuario Spotify ID: ${spotifyUserId}`);
            console.log(`🔍 Nombre de usuario: ${userProfile.display_name}`);
            
            const data = await spotifyRequest(req.user.id, '/me/playlists', { limit: 50 });
            console.log(`📊 Total de playlists obtenidas: ${data.items.length}`);
            
            const userPlaylists = data.items.filter(playlist => {
                const isOwner = playlist.owner?.id === spotifyUserId;
                console.log(`  📌 "${playlist.name}" - Owner: ${playlist.owner?.display_name || playlist.owner?.id} - Es dueño: ${isOwner}`);
                return isOwner;
            });
            
            console.log(`✅ ${userPlaylists.length} playlists del usuario (de ${data.items.length} totales)`);
            
            res.json({ items: userPlaylists });
            
        } catch (error) {
            const status = error.status || error.response?.status || 500;
            console.error(`❌ Error en /playlists (${status}):`, error.message);
            
            if (status === 401) {
                return res.status(401).json({ 
                    error: 'Spotify no conectado o sesión expirada. Reconecta tu cuenta.',
                    needs_reconnect: true
                });
            }
            
            res.status(status).json({ 
                error: error.message || 'Error al obtener playlists'
            });
        }
    });

    // ============================================================
    // 16. INICIAR SERVIDOR
    // ============================================================
    const PORT = process.env.PORT || 8888;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Servidor SOUL corriendo en puerto ${PORT}`);
        console.log(`📌 URL del servidor: https://soul-backend-hbdp.onrender.com`);
    });