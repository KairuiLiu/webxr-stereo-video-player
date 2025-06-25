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
let isXrImmersiveMode = false;
scene.enableStats(false);

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

/// ============================================================================

let fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'video/*';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);

fileInput.addEventListener('change', (ev) => {
    const file = event.target.files[0];
    if (file) {
        instanceVideo(URL.createObjectURL(file), "mono");
    }
});

let fileButtonTexture = new UrlTexture('media/textures/Box.png');
const fileButton = new ButtonNode(fileButtonTexture, () => {
    fileInput.click();
});
fileButton.scale = [5, 5, 5];
fileButton.translation = [-1.5, -1.2, -4.2];
scene.addNode(fileButton);

/// ============================================================================

let upDownButtonTexture = new UrlTexture('media/textures/TB.png');
const upDownButton = new ButtonNode(upDownButtonTexture, () => {
    instanceVideo(videoElement.src, "stereoTopBottom");
});
upDownButton.scale = [5, 5, 5];
upDownButton.translation = [-0.5, -1.2, -4.2];
scene.addNode(upDownButton);

let leftRightButtonTexture = new UrlTexture('media/textures/LR.png');
const leftRightButton = new ButtonNode(leftRightButtonTexture, () => {
    instanceVideo(videoElement.src, "stereoLeftRight");
});
leftRightButton.scale = [5, 5, 5];
leftRightButton.translation = [0.5, -1.2, -4.2];
scene.addNode(leftRightButton);

let MonoButtonTexture = new UrlTexture('media/textures/Mono.png');
const MonoButton = new ButtonNode(MonoButtonTexture, () => {
    instanceVideo(videoElement.src, "mono");
});
MonoButton.scale = [5, 5, 5];
MonoButton.translation = [1.5, -1.2, -4.2];
scene.addNode(MonoButton);

/// ============================================================================

let videoElement = null;
let videoNode = null;
function instanceVideo(videoUrl, mode) {
    videoElement?.remove();
    scene.removeNode(videoNode);

    videoElement = document.createElement('video');
    videoElement.loop = true;
    videoElement.src = videoUrl;

    videoNode = new VideoNode({
        video: videoElement,
        displayMode: mode, // "stereoLeftRight" || "stereoTopBottom" || "mono",
    });

    videoNode.onSelect(() => {
        if (!videoElement.paused) {
            playButton.visible = true;
            videoElement.pause();
        } else {
            playButton.visible = false;
            videoElement.play();
        }
    });
    videoNode.selectable = true;

    videoNode.translation = [0.025, 0.275, -4.4];
    videoNode.scale = [2.1, 1.1, 1.0];
    scene.addNode(videoNode);

    videoElement.addEventListener('loadeddata', () => {
        let aspect = videoNode.aspectRatio;
        if (aspect < 2.0) {
            videoNode.scale = [aspect * 1.1, 1.1, 1.0];
        } else {
            videoNode.scale = [2.1, 2.1 / aspect, 1.0];
        }
        if (isXrImmersiveMode) {
            videoElement.play();
        }
    });
}

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

    pending = videoElement.play().then(() => {
        videoElement.pause();
    });

    return navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor']
    }).then((session) => {
        xrButton.setSession(session);
        session.isImmersive = true;
        onSessionStarted(session);

        pending.then(() => {
            videoElement.play();
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
            isXrImmersiveMode = true;
        } else {
            inlineViewerHelper = new InlineViewerHelper(gl.canvas, refSpace);
        }

        session.requestAnimationFrame(onXRFrame);
    });
}

function onEndSession(session) {
    isXrImmersiveMode = false;
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

instanceVideo("media/video/bbb-sunflower-540p2-1min.webm", "stereoTopBottom");
initXR();
