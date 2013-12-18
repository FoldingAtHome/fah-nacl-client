/*
              This file is part of the Folding@home NaCl Client

          Copyright (c) 2013, Hong Kong University Science & Technology
                 Copyright (c) 2013, Stanford University
                             All rights reserved.

        This software is free software: you can redistribute it and/or
        modify it under the terms of the GNU Lesser General Public License
        as published by the Free Software Foundation, either version 2.1 of
        the License, or (at your option) any later version.

        This software is distributed in the hope that it will be useful,
        but WITHOUT ANY WARRANTY; without even the implied warranty of
        MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
        Lesser General Public License for more details.

        You should have received a copy of the GNU Lesser General Public
        License along with this software.  If not, see
        <http://www.gnu.org/licenses/>.

                For information regarding this software email:
                               Joseph Coffland
                        joseph@cauldrondevelopment.com
*/

var fah = {
    version: '8.0.0',
    user: 'Anonymous',
    team: 0,

    as_url: 'http://fah.stanford.edu:8080',
    stats_url: 'http://folding.stanford.edu/stats.py',
    project_url: 'http://folding.stanford.edu/project-jsonp.py',

    max_project_brief: 600, // Maximum brief project description length
    min_delay: 15,
    max_delay: 15 * 60,

    pausing: false,
    paused: false,
    finish: false,

    last_stats: 0,
    last_progress_time: 0,
    last_progress_count: 0,
    progress_stablize: 0,
    eta: [],

    projects: {},
    dialog_widths: {},

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


function human_number(x) {
    var parts = x.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
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


// Dialogs *********************************************************************
function dialog_open(name, closable) {
    if (typeof closable == 'undefined') closable = true;

    var div = $('#' + name + '-dialog');
    var width = fah.dialog_widths[name];
    if (typeof width == 'undefined') width = div.css('width');
    if (typeof width == 'undefined' || width == '0px') width = '500px';
    fah.dialog_widths[name] = width;

    var buttons;
    if (closable)
        buttons = [{text: 'Ok', click: function () {$(this).dialog('close');}}];

    div.dialog({
        modal: true, closeOnEscape: closable, width: width,
        buttons: buttons,
        open: function(event, ui) {
            if (!closable)
                $('.ui-dialog-titlebar-close', $(this).parent()).hide();
        }});
}


function dialog_open_event(e) {
    dialog_open($(this).attr('name'));
    e.preventDefault();
}


// Watchdog ********************************************************************
function watchdog_timeout() {
    if (fah.pausing) watchdog_kick();
    else fah.watchdog_call();
}


function watchdog_set(t, call) {
    fah.watchdog_call = call;
    fah.watchdog_time = t;
    clearTimeout(fah.watchdog);
    fah.watchdog = setTimeout(watchdog_timeout, t);
}


function watchdog_kick() {
    clearTimeout(fah.watchdog);
    watchdog_set(fah.watchdog_time, fah.watchdog_call);
}


function watchdog_clear() {
    clearTimeout(fah.watchdog);
}


// NaCl ************************************************************************
function module_loading() {
    watchdog_kick();
    debug("NaCl module loading");
    status_set('downloading', 'Downloading the Folding@home software in your ' +
               'Web browser.  On your first visit this can take awhile.');
}


function module_progress(event) {
    watchdog_kick();

    var total = event.total ? event.total : 18000000;
    var percent = (event.loaded / total * 100.0).toFixed(1);
    var msg = percent + '%';

    fah.progress_total = total;
    progress_update(event.loaded);

    debug('load progress: ' + msg + ' (' + event.loaded + ' of ' + total +
          ' bytes)');
}


function module_load_failed() {
    dialog_open('load-failed', false);
}


function module_loaded() {
    watchdog_set(30000, module_load_failed);

    debug("NaCl module loaded");
    fah.nacl = document.getElementById('fahcore');
    post_message('ping');
}


function module_exit() {
    debug('Module exit');
    $('#listener').html($('#listener').clone());
}


function module_timeout() {
    dialog_open('nacl-error', false);
}


function post_message(msg) {
    if (typeof fah.nacl != 'undefined') fah.nacl.postMessage(msg);
}


function handle_message(event) {
    var cmd = (typeof event.data == 'string') ? event.data : event.data[0];

    switch (true) {
    case cmd == 'pong':
        debug("NaCl module responded");
        watchdog_clear();
        init(); // Start client
        break;

    case cmd == 'threads': fah.threads = event.data[1]; break;
    case cmd == 'step': step_wu(event.data[1], event.data[2]); break;
    case cmd == 'results':
        finish_wu(event.data[1], event.data[2], event.data[3]);
        break;
    case cmd == 'paused': folding_paused(); break;
    case cmd == 'unpaused': folding_unpaused(); break;
    default: debug(event.data); break;
    }
}


function module_error(event) {
    debug('NaCl module error');
}


/**************************** Stats functions *********************************/
function stats_load() {
    if (fah.user.toLowerCase() == 'anonymous' && fah.team == 0) {
        $('#points').text('Choose a name and earn points. ' +
                          'Join a team and compete for fun.');
        return;
    }

    $.ajax({
        url: fah.stats_url,
        type: 'GET',
        data: {'user': fah.user, 'team': fah.team, 'passkey': fah.passkey,
               'version': fah.version},
        cache: false,
        dataType: 'jsonp',
        success: stats_update
    });
}


function stats_update(data) {
    if (data[0].length != 2 || data[0][0] != 'stats') {
        debug("Unexpected stats response:", data);
        return;
    }
    var stats = data[0][1];
    debug('stats:', stats);

    var user = $('<span>');
    var team = $('<team>');

    if (fah.user.toLowerCase() == 'anonymous')
        user.append('Choose a name and earn points.');

    else {
        $('<a>')
            .attr({href: stats.url, target: '_blank'})
            .text('You')
            .appendTo(user);

        user.append(' have earned ');

        $('<span>')
            .addClass('user-points')
            .text(human_number(stats.earned))
            .appendTo(user);

        user.append(' points.');
    }

    if (fah.team == 0) team.append('Consider joining a team.');
    else {
        var team_name;
        if (typeof stats.team_url != 'undefined') {
            var url = stats.team_url;
            if (!/^https?:\/\//.test(url)) url = 'http://' + url;
            team_name = $('<a>').attr({target: '_blank', href: url});

        } else team_name = $('<span>');

        team_name.append('Your team');

        if (stats.team_name)
            team_name.append(', "').append(stats.team_name).append('", ');

        team.append(team_name);

        team.append(' has earned ');

        $('<span>')
            .addClass('team-points')
            .text(human_number(stats.team_total))
            .appendTo(team);

        team.append(' points.');
    }

    $('#points').html(user).append(' ').append(team);
}


// Projects ********************************************************************
function project_show(id) {
    if (id in fah.projects)
        $('#project .brief')
            .html(fah.projects[id].brief)
            .find('a').attr('target', '_blank');
}


function project_details(id) {
    $('#project-dialog')
        .attr('title', 'Project: ' + id)
        .html(fah.projects[id].details)
        .find('a').attr('target', '_blank');

    dialog_open('project');
}


function project_update(data) {
    if (data[0].length != 2 || data[0][0] != 'project') {
        debug("Unexpected project response:", data);
        return;
    }

    var p = data[0][1];

    var brief;
    var details;

    if (typeof p.error != 'undefined')
        brief = details = '<em>' + p.error + '</em>';

    else {
        // Shorten brief description if necessary
        var desc;
        if (fah.max_project_brief - 3 < p.pdesc.length)
            desc = p.pdesc.substr(0, fah.max_project_brief - 3) + '...';
        else desc = p.pdesc;

        // Thumb
        var thumb;
        if (typeof p.pthumb != 'undefined')
            thumb = $('<img>')
            .attr('src', 'data:;base64, ' + p.pthumb)
            .addClass('pthumb');

        // Brief
        brief = $('<div>').addClass('project');
        if (thumb) brief.append(thumb);
        $('<p>').html(desc)
            .append($('<a>')
                    .attr({href: 'javascript:void()',
                           onclick: 'project_details(' + p.id +
                           '); return false;'})
                    .text('Learn more'))
            .appendTo(brief);

        // Details
        details = $('<div>').addClass('project details');
        if (thumb) details.append(thumb.clone());
        $('<p>').text('Disease Type: ' + p.disease).appendTo(details);
        details.append(p.pdesc);
        details.append('<br>');
        $('<em>').text('Project managed by ' + p.name + ' at ' + p.uni + '.')
            .appendTo(details);
        if (p.url != '') $('<p>').append('URL: ')
            .append($('<a>').attr('href', p.url).text(p.url)).appendTo(details);
        if (p.mthumb != '')
            $('<div>').addClass('mthumb')
            .append($('<img>').attr('src', 'data:;base64, ' + p.mthumb))
            .appendTo(details);
        details.append(p.mdesc);
    }

    fah.projects[p.id] = {brief: brief, details: details};

    if (p.id == fah.project) project_show(p.id);
}


function project_load(id) {
    if (!id) return;

    if (id in fah.projects) {
        project_show(id);
        return;
    }

    $('span.project').text(id);
    $('#project .brief').html(
        '<a href="#" onclick="project_load(' + id +
            ')">Loading details...</a>');

    $.ajax({
        url: fah.project_url,
        type: 'GET',
        data: {'id': id, 'version': fah.version},
        cache: true,
        dataType: 'jsonp',
        success: project_update
    });
}


// UI Status *******************************************************************
function eta_reset(clear) {
    if (typeof clear == 'undefined' || clear) fah.eta = 0;
    $('#eta').text('');
    fah.last_progress_time = 0;
    fah.last_progress_count = 0;
    fah.progress_stablize = 0;
}


function eta_update(count) {
    var eta = 0;
    var now = new Date().valueOf();
    var delta = count - fah.last_progress_count;

    if (0 < delta && fah.last_progress_time) {
        var sample = (now - fah.last_progress_time) / delta;
        fah.eta = sample = fah.eta ? fah.eta * 0.98 + sample * 0.02 : sample;
        if (0 < sample) eta = (fah.progress_total - count) * sample / 1000.0;
    }

    if (fah.progress_stablize && fah.progress_stablize - 0.9 < eta &&
        eta < fah.progress_stablize + 0.9) eta = fah.progress_stablize;
    else fah.progress_stablize = eta;

    if (delta) fah.last_progress_time = now;
    fah.last_progress_count = count;

    return eta;
}


function power_init() {
    var slider = $('#slider');
    slider.slider({
        min: 1, max: 3, range: "min", value: 1,
        slide: function(event, ui) {
            var margin = {1: -2, 2: -12, 3: -24}[ui.value];
            slider.find(".ui-slider-handle").css({"margin-left": margin});
        },
        stop: function(e, ui) {power_set(ui.value);}
    });

    var power = $.cookie('fah_power');
    if (typeof power == 'undefined') power = 'medium';

    power_update(power);
    power_set(power);
}


function power_update(power) {
    power = power.toLowerCase();

    var v = {'light': 1, 'medium': 2, 'full': 3};
    $('#slider').slider('option', 'value', v[power]);

    var margin = {'light': -1, 'medium': -12, 'full': -24}[power];
    $('#slider').find(".ui-slider-handle").css({"margin-left": margin});
}


function power_set(power) {
    if (typeof power != 'string')
        power = {1: 'light', 2: 'medium', 3: 'full'}[power];

    $.cookie('fah_power', power);
    try {post_message(['power', power]);} catch (e) {}
}


function progress_start(total) {
    fah.progress_total = total;
    $('#progress div').css({width: 0}).text('0.0%');
    eta_reset();
}


function progress_update(current) {
    if (fah.pausing) {
        $('#progress div')
            .css({width: '100%', 'text-align': 'center', background: '#fff276'})
            .text('Paused');
        eta_reset(false);
        return;
    }

    var percent = (current / fah.progress_total * 100).toFixed(1) + '%';
    $('#progress div')
        .css({width: percent, 'text-align': 'right', background: '#7a97c2'})
        .text(percent);

    var eta = Math.floor(eta_update(current));
    if (eta) $('#eta').text('The current operation will complete in about ' +
                            human_time(eta)) + '.';
    else $('#eta').text('');
}


function status_unpause() {
    var status = fah.status;
    var msg = fah.msg;
    fah.status = fah.msg = '';
    status_set(status, msg);
}


function status_set(status, msg) {
    if (status != 'paused') {
        if (fah.status == status && fah.msg == msg) return;

        fah.status = status;
        fah.msg = msg;
    }

    if (!fah.paused) {
        $('#status-image').removeClass();
        $('#status-image').addClass(status);
        $('#status-text').text(msg);
    }
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
    if (fah.pausing) {
        folding_paused();
        setTimeout(function () {server_call(url, data, success, error);}, 250);
        return;

    } else folding_unpaused();

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
    server_call(fah.as_url + '/api/' + cmd, data, success, error);
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
    if (fah.finish) {
        pause_folding();
        progress_update(0);
        $.removeCookie('fah_paused');
    }

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
    project_load(fah.project = assign.project);
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
    post_message(['start', JSON.stringify(wu), data[2], data[3], fah.as_cert,
                  str2ab(data[4])]);
    post_message(['power', $.cookie('fah_power')]);
}


function step_wu(total, count) {
    status_set('running', 'Running work unit.');
    fah.progress_total = total;
    var eta = (total - count) / 10; // TODO
    progress_update(count, eta);
}


function finish_wu(results, signature, data) {
    status_set('running', 'Finalizing work unit.');
    fah.results = JSON.parse(results);
    fah.signature = signature;
    fah.data = data;
    return_ws();
    backoff_reset('ws');
    stats_load();
}


function return_ws() {
    wu_return(fah.ws, return_ws_results, return_cs);
}


function return_ws_results(data) {
    if (data == 'success') wu_complete();
    else return_cs(); // Try CS
}


function return_cs(jqXHR, status, error) {
    debug('WU return to WS failed:', error);

    if (fah.wu.cs) wu_return(fah.wu.cs, return_cs_results, return_cs_error);
    else backoff(return_ws, 'return', 'Waiting to retry sending results');
}


function return_cs_results(data) {
    if (typeof data != 'undefined' && data == 'success') wu_complete();
    else return_cs_error();
}


function return_cs_error(jqXHR, status, error) {
    debug('WU return to CS failed:', error);
    backoff(return_ws, 'return', 'Waiting to retry sending results');
}


function wu_complete() {
    post_message(['exit']);
}


function folding_unpaused() {
    fah.paused = false;
    status_unpause();
}


function folding_paused() {
    if (fah.paused) return;

    if (fah.finish)
        status_set('finished', 'Folding finished, exit the browser or close ' +
                   'this page to shutdown Folding@home or press the start ' +
                   'button to resume folding.');
    else status_set('paused', 'Press the start button to continue.');

    eta_reset(false);

    fah.paused = true;
}


function pause_folding() {
    if (fah.pausing) return;
    fah.pausing = true;
    $.cookie('fah_paused', true);

    $('.folding-stop').hide();
    $('.folding-start').show();

    post_message(['pause']);
}


function unpause_folding() {
    if (!fah.pausing) return;
    fah.pausing = false;
    fah.finish = false;
    $.removeCookie('fah_paused');

    $('.folding-start').hide();
    $('.folding-stop').show();

    post_message(['unpause']);
}


// Identity ********************************************************************
function load_identity() {
    if ($.cookie('fah_user'))
        $('input.user').val(fah.user = $.cookie('fah_user'));

    if ($.cookie('fah_team'))
        $('input.team').val(fah.team = $.cookie('fah_team'));

    if ($.cookie('fah_passkey'))
        $('input.passkey').val(fah.passkey = $.cookie('fah_passkey'));

    stats_load();
}


function save_identity(e) {
    if (typeof e != 'undefined') e.preventDefault();

    var errors = []

    var user = $('input.user').val().trim();
    if (user == '') user = 'Anonymous';
    if (!/^[!-~]+$/.test(user)) errors.push('user');

    var team = $('input.team').val().trim();
    if (!/^\d{1,10}$/.test(team) || $.isNumeric(team) == false)
        errors.push('team');

    var passkey = $('input.passkey').val().trim();
    if (passkey != '' && !/^[a-fA-F0-9]{32}$/.test(passkey))
        errors.push('passkey');

    if (errors.length) {
        $('#invalid-id-dialog div').css({display: 'none'});

        for (var i = 0; i < errors.length; i++)
            $('#invalid-id-dialog .' + errors[i]).css({display: 'block'});

        dialog_open('invalid-id');

    } else {
        $.cookie('fah_user', fah.user = user);
        $.cookie('fah_team', fah.team = team);
        $.cookie('fah_passkey', fah.passkey = passkey);

        debug('Identity saved');
        stats_load();
    }
}


// Init ************************************************************************
$(function () {
    watchdog_set(5000, module_timeout);

    // Use local AS for development
    if (document.location.host == 'localhost')
        fah.as_url = 'http://localhost:8888';
    else if (document.location.host == '127.0.0.1')
        fah.as_url = 'http://127.0.0.1:8888';

    // Open all links in new tab
    $('a').attr('target', '_blank');

    // Restore state
    if ($.cookie('fah_paused')) pause_folding();
    load_identity();

    // Power slider
    power_init();

    // Start stop button
    $('.folding-stop .button').on('click', pause_folding);
    $('.folding-start .button').on('click', unpause_folding);
    $('#nacl-error-dialog li').click(function () {
        $(this).find('p').slideToggle();
    });

    // Dialogs
    $('a.dialog-link').click(dialog_open_event);

    // Save identity
    $('.save-id').click(save_identity);

    // Enable Bug Reporting
    $('.report-bug').on('click', function(e) {
        e.preventDefault();
        bug_report();
    });

    // Share Links
    var share_url = 'http%3A%2F%2Ffolding.stanford.edu%2Fnacl%2F';
    var share_text = 'Share+your+unused+computer+power+to+help+find+a+cure.';

    $('a.twitter').attr({href: 'https://twitter.com/share?url=' + share_url +
                         '&text=' + share_text});
    $('a.facebook').attr({href: 'http://www.facebook.com/sharer.php?u=' +
                          share_url + '&t=' + share_text});

    // Catch exit
    window.onbeforeunload = function (e) {
        if (fah.paused) return;

        var message = 'If you choose to stay on this page Folding@home will ' +
            'finish its current work and then pause.  You can then leave ' +
            'with out loosing any work.';

        fah.finish = true;

        e = e || window.event;
        if (e) e.returnValue = message; // For IE and Firefox
        return message; // For Safari
    };
});
