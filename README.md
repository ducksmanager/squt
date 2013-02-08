## squt (it's like SQL, but cUTe)

squt is a Perl and PHP/JS library aiming at graphically representing SQL queries in a graph form.

![squt example](front-end/images/squt_example.png)

squt uses :
* Marijn Haverbeke's [CodeMirror](https://github.com/marijnh/CodeMirror) for the in-browser code editor
* PrettyCode's [Object.identical.js](https://github.com/prettycode/Object.identical.js.git) for testing purposes
* Philip Stoev's [MyParse](http://search.cpan.org/~philips/DBIx-MyParse/) to parse MySQL queries
* Mike Bostock's [d3](/mbostock/d3) to handle the graph representation.

All of them are integrated into squt as submodules : no need to install them manually.

Want to know more and install it ? Have a look at the [Installation guide](../../wiki/Installation Guide) !
