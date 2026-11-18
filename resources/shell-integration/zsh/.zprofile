# Grid Shell: load the user's ~/.zprofile (or $ZDOTDIR/.zprofile) first.
_gt_zdotdir=$ZDOTDIR
ZDOTDIR=${GRID_SHELL_USER_ZDOTDIR:-$HOME}
[[ -r $ZDOTDIR/.zprofile ]] && builtin source $ZDOTDIR/.zprofile
GRID_SHELL_USER_ZDOTDIR=$ZDOTDIR
ZDOTDIR=$_gt_zdotdir
unset _gt_zdotdir
