const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.static('public'));

// RTSP URL dari kamera
const RTSP_URL = "rtsp://ppls:lentera123@e7e90fc75fd2.sn.mynetname.net:6001/cam/realmonitor?channel=1&subtype=1";

// Buat folder untuk HLS files
const hlsDir = path.join(__dirname, 'public', 'hls');
if (!fs.existsSync(hlsDir)) {
    fs.mkdirSync(hlsDir, { recursive: true });
}

let ffmpegProcess = null;

function startFFmpeg() {
    console.log('Starting FFmpeg process...');
    
    // FFmpeg command untuk convert RTSP ke HLS
    ffmpegProcess = spawn('ffmpeg', [
        '-i', RTSP_URL,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'veryfast',
        '-crf', '23',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '10',
        '-hls_flags', 'delete_segments',
        path.join(hlsDir, 'stream.m3u8')
    ]);

    ffmpegProcess.stdout.on('data', (data) => {
        console.log(`FFmpeg stdout: ${data}`);
    });

    ffmpegProcess.stderr.on('data', (data) => {
        console.log(`FFmpeg stderr: ${data}`);
    });

    ffmpegProcess.on('close', (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
        if (code !== 0) {
            // Restart jika crash
            setTimeout(startFFmpeg, 5000);
        }
    });
}

// API endpoints
app.get('/api/stream/start', (req, res) => {
    if (!ffmpegProcess) {
        startFFmpeg();
        res.json({ status: 'started', message: 'Stream mulai diproses' });
    } else {
        res.json({ status: 'already_running', message: 'Stream sudah berjalan' });
    }
});

app.get('/api/stream/stop', (req, res) => {
    if (ffmpegProcess) {
        ffmpegProcess.kill();
        ffmpegProcess = null;
        res.json({ status: 'stopped', message: 'Stream dihentikan' });
    } else {
        res.json({ status: 'not_running', message: 'Stream tidak sedang berjalan' });
    }
});

app.get('/api/stream/status', (req, res) => {
    const isRunning = ffmpegProcess !== null;
    const hlsExists = fs.existsSync(path.join(hlsDir, 'stream.m3u8'));
    
    res.json({
        ffmpeg_running: isRunning,
        hls_available: hlsExists,
        stream_url: hlsExists ? '/hls/stream.m3u8' : null
    });
});

// Serve HLS files
app.get('/hls/:file', (req, res) => {
    const fileName = req.params.file;
    const filePath = path.join(hlsDir, fileName);
    
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('File tidak ditemukan');
    }
});

// Start server
app.listen(port, () => {
    console.log(`RTSP Streaming Server berjalan di http://localhost:${port}`);
    console.log('Untuk memulai stream, buka: http://localhost:3000/api/stream/start');
});

// Auto start streaming saat server dimulai
setTimeout(() => {
    startFFmpeg();
}, 2000);

// Cleanup saat server ditutup
process.on('SIGINT', () => {
    if (ffmpegProcess) {
        ffmpegProcess.kill();
    }
    process.exit();
});