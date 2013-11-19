var as_url = 'http://fah.stanford.edu:8080';

var fah = {
    version: '8.0.0',
    user: 'Anonymous',
    team: 0
};


function debug(msg) {
    if (typeof console == 'undefined' || typeof console.log == 'undefined')
        return;

    if (typeof msg !== 'string' && typeof JSON !== 'undefined')
        msg = JSON.stringify(msg);

    console.log('DEBUG: ' + msg);
}


function has_local_storage() {
    try {
        return 'localStorage' in window && window['localStorage'] !== null;
    } catch (e) {
        return false;
    }
}

function has_wu() {
    // TODO
    return false;
}


function process_id(id) {
    alert(id);
    fah.id = id;
    $.cookie('fah_id', id, {expires: 3650});
}


function process_assign(assign) {
}


function process_project(project) {
}


function process_stats(stats) {
}


function dispatch(cmd) {
    if (cmd == null) return;

    try {
        // debug('Command: ' + JSON.stringify(cmd));

        switch (cmd[0]) {
        case 'id': process_id(cmd[1]); break;
        case 'assign': process_assign(cmd[1]); break;
        case 'project': process_project(cmd[1]); break;
        case 'stats': process_stats(cmd[1]); break;
        default: debug('Unknown command: ' + cmd); break;
        }

    } catch (err) {
        debug('Command "' + cmd + '": ' + err);
    }
}


function call_failed(jqXHR, status, error) {
    debug(status + ": " + error);
}


function as_call(cmd, data) {
    if (typeof data == 'undefined') data = {};
    data.version = fah.version;

    $.ajax({url: as_url + '/api/' + cmd, type: 'GET', data: data,
            cache: false, dataType: 'jsonp', success: dispatch,
            error: call_failed});
}


function update_id() {
    if (typeof fah.id == 'undefined') as_call('id');
}


function update_ws() {
    as_call('assign',
            {type: 'NACL', user: fah.user, team: fah.team,
             passkey: fah.passkey});
}


function load_settings() {
    fah.id = $.cookie('fah_id');
    fah.user = $.cookie('fah_user');
    fah.team = $.cookie('fah_team');
    fah.passkey = $.cookie('fah_passkey');
}


$(function () {
    // Open all links in new tab
    $('a').attr({'target': '_blank'});

    // Get AS ID
    update_id();
});
