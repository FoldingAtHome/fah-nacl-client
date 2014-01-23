/*
              This file is part of the Folding@home NaCl Client

        Copyright (c) 2013-2014, Hong Kong University Science & Technology
               Copyright (c) 2013-2014, Stanford University
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

function bug_submit_ok() {
    $('#bug-submission-dialog').dialog('destroy');
}


function bug_fail() {
    var dialog = $('#bug-submission-dialog');

    var h2 = dialog.find('h2');
    h2.text('Bug report submission failed');
    h2.css('color', 'red');

    var iframe = $('#bug-iframe');
    iframe.css('display', 'none');
}


function bug_submit() {
    var fail = false;
    var dialog = $('#bug-dialog');

    // Category
    var category = dialog.find('select[name=category]');
    if (category.val() == 'choose') {
        category.addClass('input-warn');
        fail = true;

    } else category.removeClass('input-warn');

    // Description
    var description = dialog.find('textarea');
    if ($.trim(description.val()) == '') {
        description.addClass('input-warn');
        fail = true;

    } else description.removeClass('input-warn');

    if (fail) return false;

    var form = $('#bug-dialog form');
     form.find(':input[name=ts]').val(new Date().toJSON());
    form.submit();

    dialog.dialog('destroy');

    $('#bug-submission-dialog').dialog({
        modal: true,
        resizable: false,
        width: 600,
        buttons: {'Ok': bug_submit_ok},
        dialogClass: 'no-close',
        closeOnEscape: false,
        beforeClose: function() {return false;}
    });
}


function bug_cancel() {
    $('#bug-dialog').dialog('destroy');
}


function bug_report() {
    var dialog = $('#bug-dialog');
    dialog.find('input[name=user]').val(fah.user);
    dialog.find('input[name=team]').val(fah.team);
    dialog.find('.user').text(fah.user);
    dialog.find('.team').text(fah.team);
    dialog.find('textarea').val('');

    dialog.dialog({
        modal: true,
        resizable: false,
        width: 600,
        buttons: {
            'Cancel': bug_cancel,
            'Submit': bug_submit
        }
    });
}
