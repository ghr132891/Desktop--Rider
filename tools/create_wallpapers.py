from pathlib import Path
palettes = {
 'mountain': ['#7fa4cf','#c1d4e5','#e9e8df','#a6bbd0','#7f9cbf','#6489b5','#4c72a0','#3b5d88','#29476e'],
 'dusk': ['#989bc5','#dfbfce','#fae0cf','#b4acc8','#9793ba','#827da6','#706d97','#575a83','#3d456b'],
 'forest': ['#88a9a7','#c4d9d0','#ece9d6','#a4bfb1','#85aa9d','#67958c','#4f7d77','#396663','#254e4f'],
 'sand': ['#b5b6bc','#e1d7c8','#fff0d5','#cbbbaf','#b7a79d','#aa948a','#947e78','#7e6865','#655354']
}
for name,c in palettes.items():
 s=f'''<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
 <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="{c[0]}"/><stop offset="1" stop-color="{c[1]}"/></linearGradient><linearGradient id="front" x2="0.7" y2="1"><stop stop-color="{c[7]}"/><stop offset="1" stop-color="{c[8]}"/></linearGradient><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".035"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter></defs>
 <g filter="url(#grain)"><path fill="url(#sky)" d="M0 0h1600v1000H0z"/><circle cx="1210" cy="220" r="70" fill="{c[2]}" opacity=".7"/>
 <path fill="{c[3]}" d="M0 527 90 492 158 445 230 466 320 389 376 406 470 325 527 344 601 307 682 374 773 391 852 350 940 406 1000 379 1073 439 1190 411 1300 462 1410 414 1500 434 1600 408V1000H0Z"/>
 <path fill="{c[4]}" d="M0 635 100 571 192 589 285 549 357 580 452 506 527 538 628 464 720 509 809 480 884 505 998 467 1090 530 1168 487 1252 530 1370 481 1476 535 1600 504V1000H0Z"/>
 <path fill="{c[5]}" d="M0 560C115 559 130 633 240 618S365 573 474 623 575 645 670 616 782 596 882 639 1008 600 1110 646 1250 601 1390 649 1518 622 1600 643V1000H0Z"/>
 <path fill="{c[6]}" d="M0 721C102 710 152 643 240 659S342 719 460 698 590 666 690 712 824 742 917 717 1036 641 1143 688 1246 718 1340 687 1490 712 1600 687V1000H0Z"/>
 <path fill="{c[7]}" d="M0 823C110 770 190 813 294 766S402 750 493 788 650 819 746 769 900 794 977 753 1114 768 1207 801 1380 742 1472 774 1550 799 1600 768V1000H0Z"/>
 <path fill="url(#front)" d="M0 857C135 808 245 864 371 887S552 846 674 875 858 836 989 873 1172 839 1285 875 1461 840 1600 855V1000H0Z"/></g></svg>'''
 Path('assets',name+'.svg').write_text(s)
