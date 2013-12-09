var as_url = 'http://fah.stanford.edu:8888';
var as_url = 'http://localhost:8888';

var fah = {
    version: '8.0.0',
    user: 'Anonymous',
    team: 0,

    min_delay: 15,
    max_delay: 15 * 60,

    timeout: setTimeout(moduleTimeout, 3000),
    pausing: false,
    paused: false,

    last: null
};


// Utility functions ***********************************************************
function debug() {
    if (typeof console == 'undefined' || typeof console.log == 'undefined')
        return;

    var msg = $.map(arguments, function (item) {
        if (typeof item !== 'string' && typeof JSON !== 'undefined')
            return JSON.stringify(item);
        return item;
    });

    console.log('DEBUG: ' + msg.join(' '));
}


function int(x) {
    return Math.floor(x);
}


var MIN = 60;
var HOUR = 60 * MIN;
var DAY = 24 * HOUR;
var YEAR = 356 * DAY;

function human_time_slice(t, d1, n1, d2, n2) {
    var x = int(t / d1);
    var y = int((t % d1) / d2);

    return x + ' ' + n1 + (1 < x ? 's' : '') + ' and ' +
        y + ' ' + n2 + (1 < y ? 's' : '');
}

function human_time(t) {
    if (YEAR <= t) return human_time_slice(t, YEAR, 'year', DAY, 'day');
    if (DAY <= t) return human_time_slice(t, DAY, 'day', HOUR, 'hour');
    if (HOUR <= t) return human_time_slice(t, HOUR, 'hour', MIN, 'minute');
    if (MIN <= t) return human_time_slice(t, MIN, 'minute', 1, 'second');

    return t + ' second' + (1 < t ? 's' : '');
}


function have_local_storage() {
    try {
        return 'localStorage' in window && window['localStorage'] !== null;
    } catch (e) {
        return false;
    }
}


function ab2str(buf) {
    var s = "";
    var bufView = new Uint8Array(buf);

    for (var i = 0; i < bufView.length; i++)
        s += String.fromCharCode(bufView[i]);

    return s;
}


function str2ab(str) {
    var buf = new ArrayBuffer(str.length);
    var bufView = new Uint8Array(buf);

    for (var i = 0; i < str.length; i++)
        bufView[i] = str.charCodeAt(i);

    return buf;
}


// NaCl ************************************************************************
function moduleLoaded() {
    debug("NaCl module loaded");
    fah.nacl = document.getElementById('fahcore');
    fah.nacl.postMessage('ping');
}


function moduleTimeout() {
    $('#requirements-dialog').dialog({
        modal: true, closeOnEscape: false, width: 400,
        open: function(event, ui) {
            $('.ui-dialog-titlebar-close', $(this).parent()).hide();
        }});
}


function handleMessage(event) {
    var cmd = (typeof event.data == 'string') ? event.data : event.data[0];

    switch (true) {
    case cmd == 'pong':
        debug("NaCl module responded");
        clearTimeout(fah.timeout);
        init(); // Start client
        break;

    case cmd == 'step': step_wu(event.data[1], event.data[2]); break;
    case cmd == 'results':
        finish_wu(event.data[1], event.data[2], event.data[3]);
        break;
    case cmd == 'paused': folding_paused(); break;
    case cmd == 'unpaused': folding_unpaused(); break;
    default: debug(event.data); break;
    }
}


// UI Status *******************************************************************
function progress_start(total) {
    fah.progress_total = total;
    $('#progress div').css({width: 0}).text('0.0%');
    $('#eta').text('');
}


function progress_update(current, eta) {
    if (fah.pausing) {
        $('#progress div')
            .css({width: '100%', 'text-align': 'center', background: '#fff276'})
            .text('Paused');
        $('#eta').text('');
        return;
    }

    var percent = (current / fah.progress_total * 100).toFixed(1) + '%';
    $('#progress div')
        .css({width: percent, 'text-align': 'right', background: '#7a97c2'})
        .text(percent);

    if (typeof eta != 'undefined')
        $('#eta')
        .text('The current operation will complete in about ' +
              human_time(Math.floor(eta)));
    else $('#eta').text('');
}


function status_set(status, msg) {
    if (fah.status == status && fah.msg == msg) return;
    fah.status = status;
    fah.msg = msg;

    $('#status-image').removeClass();
    $('#status-image').addClass(status);
    $('#status-text').text(msg);
}


// Backoff *********************************************************************
function backoff_reset(name) {
    if (typeof name == 'undefined') fah.backoff = {}
    else delete fah.backoff[name];
}


function backoff(call, id, msg) {
    var delay;

    if (typeof fah.backoff[id] == 'undefined') delay = fah.min_delay;
    else {
        delay = 2 * fah.backoff[id];
        if (fah.max_delay < delay) delay = fah.max_delay;
    }

    fah.backoff[id] = delay;

    status_set('waiting', msg);
    progress_start(delay);
    countdown(delay * 1000, call);
}


function countdown_paused(call) {
    if (fah.pausing) setTimeout(function () {countdown_paused(call)}, 250);
    else {
        folding_unpaused();
        call();
    }
}


function countdown(delay, call) {
    if (fah.pausing) {
        folding_paused();
        progress_update(0);
        countdown_paused(call);
        return;
    }

    progress_update(fah.progress_total - delay / 1000, delay / 1000);

    if (delay <= 0) {
        call();
        return;
    }

    var delta = Math.min(250, delay);
    setTimeout(function () {countdown(delay - delta, call);}, delta);
}


// Network functions ***********************************************************
function server_call(url, data, success, error) {
    if (typeof data == 'undefined') data = {};
    data.version = fah.version;
    data.type = 'NACL';
    data.user = fah.user;
    data.team = fah.team;
    data.passkey = fah.passkey;

    url += '?' + Math.random();
    $.ajax({url: url, type: 'POST', data: JSON.stringify(data),
            dataType: 'json', contentType: 'application/json; charset=utf-8'})
        .done(success).fail(error);
}


function as_call(cmd, data, success, error) {
    server_call(as_url + '/api/' + cmd, data, success, error);
}


function ws_call(ws, cmd, data, success, error) {
    server_call('http://' + ws + ':8080/api/' + cmd, data, success, error);
}


function wu_return(server, success, error) {
    // TODO monitor upload progress
    ws_call(server, 'results',
            {wu: fah.wu, results: fah.results, signature: fah.signature,
             data: fah.data}, success, error);
}


// Status Functions ************************************************************
function have_id() {
    return typeof $.cookie('fah_id') != 'undefined';
}


function set_id(id) {
    $.cookie('fah_id', id, {expires: 3650});
}


function get_id(id) {
    return $.cookie('fah_id');
}


// State Transitions ***********************************************************
function init() {
    backoff_reset();

    if (!have_id()) request_id();
    else request_assignment();
}


function request_id() {
    status_set('downloading', 'Requesting ID.');
    as_call('id', {}, process_id, request_id_error);
}


function process_id(data) {
    if (typeof data == 'undefined' || data[0] != 'id') {
        debug('Unexpected response to ID request: ', data);
        request_id_error();
        return;
    }

    var id = data[1];
    debug('ID:', id);
    $.cookie('fah_id', id, {expires: 3650});

    request_assignment();
}


function request_id_error(jqXHR, status, error) {
    if (typeof status != 'undefined')
        debug(status + ': ID request failed.', error);
    backoff(request_id, 'id', 'Waiting to retry ID request');
}


function request_assignment() {
    status_set('downloading', 'Requesting a work server assignment.');
    delete fah.results;
    as_call('assign', {client_id: get_id()}, request_wu, assign_error);
}


function assign_error(jqXHR, status, error) {
    if (typeof status != 'undefined')
        debug(status + ': Assignment failed.', error);
    backoff(request_assignment, 'ws',
            'Waiting to retry work server assignment');
}


function request_wu(data) {
    if (typeof data == 'undefined' || data[0] != 'assign' || data.length < 4) {
        debug('Unexpected response to AS assignment request: ', data);
        assign_error();
        return;
    }

    // TODO Monitor download progress

    var assign = data[1];
    debug('WS:', assign);
    fah.ws = assign.ws;
    fah.project = assign.project;
    fah.as_cert = data[3];

    status_set('downloading', 'Requesting a work unit.');

    ws_call(fah.ws, 'assign', {assignment: assign, signature: data[2]},
            start_wu, assign_error);
}


function start_wu(data) {
    if (typeof data == 'undefined' || data[0] != 'wu' || data.length != 5) {
        debug('Unexpected response to WU assignment request: ', data);
        assign_error();
        return;
    }

    var wu = data[1];
    debug('WU:', wu);
    fah.wu = wu;
    fah.wu_signature = data[2];

    status_set('running', 'Starting work unit.');
    progress_start(0);
    fah.nacl.postMessage(['start', JSON.stringify(wu), data[2], data[3],
                          fah.as_cert, str2ab(data[4])]);
}


function step_wu(total, count) {
    status_set('running', 'Running work unit.');
    fah.progress_total = total;
    var eta = (total - count) / 10; // TODO
    progress_update(count, eta);
}


function finish_wu(results, signature, data) {
    status_set('running', 'Finishing work unit.');
    fah.results = JSON.parse(results);
    fah.signature = signature;
    fah.data = data;
    return_ws();
    backoff_reset('ws');
}


function return_ws() {
    wu_return(fah.ws, return_ws_results, return_cs);
}


function return_ws_results(data) {
    if (data == 'success') request_assignment();
    else return_cs(); // Try CS
}


function return_cs(jqXHR, status, error) {
    debug('WU return to WS failed:', error);

    if (fah.wu.cs) wu_return(fah.wu.cs, return_cs_results, return_cs_error);
    else backoff(return_ws, 'return', 'Waiting to retry sending results');
}


function return_cs_results(data) {
    if (typeof data != 'undefined' && data == 'success') request_assignment();
    else return_cs_error();
}


function return_cs_error(jqXHR, status, error) {
    debug('WU return to CS failed:', error);
    backoff(return_ws, 'return', 'Waiting to retry sending results');
}


function folding_unpaused() {
    fah.paused = false;
    status_set(fah.pause_status, fah.pause_msg);
}


function folding_paused() {
    if (fah.paused) return;
    fah.paused = true;

    fah.pause_status = fah.status;
    fah.pause_msg = fah.msg;

    status_set('paused', 'Press the start button to continue.');
    $('#eta').text('');
}


function pause_folding() {
    if (fah.pausing) return;
    fah.pausing = true;

    $('.folding-stop').hide();
    $('.folding-start').show();

    fah.nacl.postMessage(['pause']);
}


function unpause_folding() {
    if (!fah.pausing) return;
    fah.pausing = false;

    $('.folding-start').hide();
    $('.folding-stop').show();

    fah.nacl.postMessage(['unpause']);
}


// Init ************************************************************************
function load_settings() {
    fah.user = $.cookie('fah_user');
    fah.team = $.cookie('fah_team');
    fah.passkey = $.cookie('fah_passkey');
}


$(function () {
    // Open all links in new tabs/windows
    $('a').attr('target', '_blank');

    $('.folding-stop .button').on('click', pause_folding);
    $('.folding-start .button').on('click', unpause_folding);
});
