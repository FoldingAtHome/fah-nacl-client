Folding@home Google NaCl Client
===============================

This project contains the source code for the Open-Source frontend of
the Folding@home NaCl Client.  This client requires the Google Chrome
browser which can be downloaded here: https://google.com/chrome/.  You
can run the client either from the Chrome Web Store:
https://chrome.google.com/webstore or by going directly to
http://folding.stanford.edu/nacl/.

# Team URLs
You can now recruit team members with URLs like this:
  http://folding.stanford.edu/nacl/?team=1234.

If the user does not already have a team then it will set their team
automatically. If they do have a team set then it will ask them first.

# Embedding
This section describes how to embed the new Folding@home micro widget
in your Web page.

The simplest way is to just add the following HTML code to your page:

    <iframe src="http://folding.stanford.edu/nacl/micro.html" width="128"
      height="48"></iframe>

However, you can also add some configuration options:

 - `team` - Your team *number*.  This will cause the points earned by visitors
   to your page to be contributed to your team.
 - `power` - May be one of `light`, `medium` or `full`.  Defaults to `medium`.
 - `fg` - Set the foreground color.  Must be a 3 or 6 digit hexadecimal number.
 - `bg` - Set the background color.  Must be a 3 or 6 digit hexadecimal number.

These options can be added as URL parameters.  For example:

    <iframe src="http://folding.stanford.edu/nacl/micro.html?team=1&fg=0f0"
      width="128" height="64"></iframe>

Note, that if you specify a team the height should be 64 rather than 48 to
make room for the team points display.

# Contact
Email joseph@cauldrondevelopment.com for more info.
