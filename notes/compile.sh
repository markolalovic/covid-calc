#!/bin/bash

htlatex main.tex "html,mathjax"
mv main.html notes.html
cp notes.html ../public/


