/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

var Guacamole = Guacamole || {};

/**
 * Provides access to the user's webcam and streams captured video frames to a
 * Guacamole.OutputStream. Frames are captured as images using an offscreen
 * canvas and encoded using the requested mimetype.
 *
 * @constructor
 * @param {!Guacamole.OutputStream} stream
 *     The stream that video data will be written to.
 *
 * @param {!string} mimetype
 *     The mimetype of the encoded video frames. This value will be passed
 *     directly to Canvas.toBlob().
 */
Guacamole.WebcamRecorder = function WebcamRecorder(stream, mimetype) {

    /**
     * Reference to this WebcamRecorder.
     *
     * @private
     * @type {!Guacamole.WebcamRecorder}
     */
    var recorder = this;

    // Some browsers do not implement navigator.mediaDevices - this shims in
    // this functionality to ensure code compatibility.
    if (!navigator.mediaDevices)
        navigator.mediaDevices = {};

    // Browsers that either do not implement navigator.mediaDevices at all or do
    // not implement it completely need the getUserMedia method defined. This
    // shims in this function by detecting one of the supported legacy methods.
    if (!navigator.mediaDevices.getUserMedia)
        navigator.mediaDevices.getUserMedia = (navigator.getUserMedia
                || navigator.webkitGetUserMedia
                || navigator.mozGetUserMedia
                || navigator.msGetUserMedia).bind(navigator);

    /**
     * Guacamole.ArrayBufferWriter wrapped around the video output stream
     * provided when this Guacamole.WebcamRecorder was created.
     *
     * @private
     * @type {!Guacamole.ArrayBufferWriter}
     */
    var writer = new Guacamole.ArrayBufferWriter(stream);

    /**
     * Video element used to render the camera stream.
     *
     * @private
     * @type {!HTMLVideoElement}
     */
    var video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;

    /**
     * Off-screen canvas used to capture frames from the video element.
     *
     * @private
     * @type {!HTMLCanvasElement}
     */
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');

    /**
     * The MediaStream providing access to the user's webcam, if any.
     *
     * @private
     * @type {MediaStream}
     */
    var mediaStream = null;

    /**
     * ID of the interval timer which captures frames, if any.
     *
     * @private
     * @type {number}
     */
    var captureInterval = null;

    /**
     * Captures a single frame from the video element, encoding it using
     * Canvas.toBlob() and sending the resulting data to the output stream.
     *
     * @private
     */
    var captureFrame = function captureFrame() {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (canvas.toBlob) {
            canvas.toBlob(function(blob) {
                if (!blob)
                    return;

                var reader = new FileReader();
                reader.onloadend = function() {
                    writer.sendData(new Uint8Array(reader.result));
                };
                reader.readAsArrayBuffer(blob);
            }, mimetype);
        }
    };

    /**
     * Stops capturing video, freeing all associated resources.
     *
     * @private
     */
    var stopVideoCapture = function stopVideoCapture() {

        // Stop frame capture interval
        if (captureInterval) {
            window.clearInterval(captureInterval);
            captureInterval = null;
        }

        // Stop all active tracks
        if (mediaStream) {
            mediaStream.getTracks().forEach(function(track) {
                track.stop();
            });
            mediaStream = null;
        }

        writer.sendEnd();
    };

    /**
     * getUserMedia() callback which handles successful retrieval of a video
     * stream (successful start of recording).
     *
     * @private
     * @param {!MediaStream} stream
     *     A MediaStream which provides access to video data read from the
     *     user's local video input device.
     */
    var streamReceived = function streamReceived(stream) {
        mediaStream = stream;
        video.srcObject = stream;
        video.onloadedmetadata = function() {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            captureInterval = window.setInterval(captureFrame, 100);
        };
        video.play();
    };

    /**
     * getUserMedia() callback which handles video recording denial.
     *
     * @private
     */
    var streamDenied = function streamDenied() {
        writer.sendEnd();
        if (recorder.onerror)
            recorder.onerror();
    };

    /**
     * Stops capturing video, if the capture has started.
     */
    this.stop = function stop() {
        stopVideoCapture();
        if (recorder.onclose)
            recorder.onclose();
    };

    // Start capturing video immediately
    var promise = navigator.mediaDevices.getUserMedia({
        'video' : true
    });
    if (promise && promise.then)
        promise.then(streamReceived, streamDenied);
    else
        navigator.mediaDevices.getUserMedia({ 'video' : true },
            streamReceived, streamDenied);
};

/**
 * Returns an instance of Guacamole.WebcamRecorder providing support for the
 * given video format. If support for the given video format is not available,
 * null is returned.
 *
 * @param {!Guacamole.OutputStream} stream
 *     The Guacamole.OutputStream to send video data through.
 *
 * @param {!string} mimetype
 *     The mimetype of the video data to be sent along the provided stream.
 *     This mimetype must be supported by Canvas.toBlob().
 *
 * @return {Guacamole.WebcamRecorder}
 *     A Guacamole.WebcamRecorder instance supporting the given mimetype and
 *     writing to the given stream, or null if support for the given mimetype
 *     is absent.
 */
Guacamole.WebcamRecorder.getInstance = function getInstance(stream, mimetype) {

    // Verify required APIs are available
    if (!document.createElement('canvas').toBlob)
        return null;

    if (!navigator.mediaDevices)
        navigator.mediaDevices = {};
    if (!navigator.mediaDevices.getUserMedia)
        navigator.mediaDevices.getUserMedia = (navigator.getUserMedia
                || navigator.webkitGetUserMedia
                || navigator.mozGetUserMedia
                || navigator.msGetUserMedia);
    if (!navigator.mediaDevices.getUserMedia)
        return null;

    return new Guacamole.WebcamRecorder(stream, mimetype);
};

