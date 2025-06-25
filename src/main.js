import { WebXRButton } from './js/util/webxr-button.js';
import { Scene } from './js/render/scenes/scene.js';
import { Renderer, createWebGLContext } from './js/render/core/renderer.js';
import { UrlTexture } from './js/render/core/texture.js';
import { ButtonNode } from './js/render/nodes/button.js';
import { VideoNode } from './js/render/nodes/video.js';
import { InlineViewerHelper } from './js/util/inline-viewer-helper.js';

// XR globals.
let xrButton = null;
let xrImmersiveRefSpace = null;
let inlineViewerHelper = null;

// WebGL scene globals.
let gl = null;
let renderer = null;
let scene = new Scene();
scene.enableStats(false);

let video = document.createElement('video');
video.loop = true;
video.src = 'media/video/bbb-sunflower-540p2-1min.webm';

let videoNode = new VideoNode({
    video: video,
    displayMode: 'stereoTopBottom',
});

// When the video is clicked we'll pause it if it's playing.
videoNode.onSelect(() => {
    if (!video.paused) {
        playButton.visible = true;
        video.pause();
    } else {
        playButton.visible = false;
        video.play();
    }
});
videoNode.selectable = true;

videoNode.translation = [0.025, 0.275, -4.4];
videoNode.scale = [2.1, 1.1, 1.0];
scene.addNode(videoNode);

video.addEventListener('loadeddata', () => {
    let aspect = videoNode.aspectRatio;
    if (aspect < 2.0) {
        videoNode.scale = [aspect * 1.1, 1.1, 1.0];
    } else {
        videoNode.scale = [2.1, 2.1 / aspect, 1.0];
    }
});

let playTexture = new UrlTexture('media/textures/play-button.png');

let playButton = new ButtonNode(playTexture, () => {
    if (video.paused) {
        playButton.visible = false;
        video.play();
    }
});
playButton.visible = false;
playButton.translation = [0.025, 0.275, -4.2];
playButton.scale = [5.0, 5.0, 5.0];
scene.addNode(playButton);

function initXR() {
    xrButton = new WebXRButton({
        onRequestSession: onRequestSession,
        onEndSession: onEndSession,
    });
    document.querySelector('#app').appendChild(xrButton.domElement);

    if (navigator.xr) {
        navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
            xrButton.enabled = supported;
        });

        navigator.xr.requestSession('inline').then(onSessionStarted);
    }
}

function initGL() {
    if (gl) return;

    gl = createWebGLContext({
        xrCompatible: true,
    });
    document.body.appendChild(gl.canvas);

    function onResize() {
        gl.canvas.width = gl.canvas.clientWidth * window.devicePixelRatio;
        gl.canvas.height = gl.canvas.clientHeight * window.devicePixelRatio;
    }
    window.addEventListener('resize', onResize);
    onResize();

    renderer = new Renderer(gl);
    scene.setRenderer(renderer);
}

function onRequestSession() {
    let pending;

    pending = video.play().then(() => {
        video.pause();
    });

    return navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor']
    }).then((session) => {
        xrButton.setSession(session);
        session.isImmersive = true;
        onSessionStarted(session);

        pending.then(() => {
            video.play();
        });
    });
}

function onSessionStarted(session) {
    session.addEventListener('end', onSessionEnded);
    session.addEventListener('select', (ev) => {
        let refSpace = ev.frame.session.isImmersive
            ? xrImmersiveRefSpace
            : inlineViewerHelper.referenceSpace;
        scene.handleSelect(ev.inputSource, ev.frame, refSpace);
    });

    initGL();
    scene.inputRenderer.useProfileControllerMeshes(session);

    let glLayer = new XRWebGLLayer(session, gl);
    session.updateRenderState({ baseLayer: glLayer });

    let refSpaceType = session.isImmersive ? 'local' : 'viewer';
    session.requestReferenceSpace(refSpaceType).then((refSpace) => {
        if (session.isImmersive) {
            xrImmersiveRefSpace = refSpace;
        } else {
            inlineViewerHelper = new InlineViewerHelper(gl.canvas, refSpace);
        }

        session.requestAnimationFrame(onXRFrame);
    });
}

function onEndSession(session) {
    session.end();
}

function onSessionEnded(event) {
    if (event.session.isImmersive) {
        xrButton.setSession(null);
        video.pause();
    }
}

function onXRFrame(t, frame) {
    let session = frame.session;
    let refSpace = session.isImmersive
        ? xrImmersiveRefSpace
        : inlineViewerHelper.referenceSpace;
    let pose = frame.getViewerPose(refSpace);

    scene.startFrame();

    session.requestAnimationFrame(onXRFrame);

    scene.updateInputSources(frame, refSpace);

    scene.drawXRFrame(frame, pose);

    scene.endFrame();
}

initXR();
