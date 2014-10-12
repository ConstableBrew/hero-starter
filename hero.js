// The Tactician
// Thinks deep into the future, weighing all options carefully before choosing a course of action.

/*
 Brainstorming:
  if I move here,
    what will my health be?
    How much damage will I deal?
    How many diamonds will I gain?
    How much will I heal others?
    Will I have a path to a health well or trusted friend?

  Who can I trust
    to heal me?
    to not steal my diamonds?
    to attack the enemy?
  Who can I not trust?
  Do my friends need help right now? Soon?

  Is my team winning?
    Am I the wealthiest on my team?

*/
var DIAMOND_MINE_CAPTURE_DAMAGE = 20;
var HERO_ATTACK_DAMAGE = 20;
var HERO_FOCUSED_ATTACK_DAMAGE = 10;
var HEALTH_WELL_HEAL_AMOUNT = 30;
var HERO_HEAL_AMOUNT = 40;

var DIRECTIONS = ['North', 'East', 'South', 'West', 'Stay'];
var MAX_DEPTH = 5;


// Holds the current state of the hero at any given point, with all relevant accumulated actions
function Status(status) {
  'use strict';
  // Simplification of hero's status
  // status parameter may be a Hero object or a Status object
  this.code = status.code || ((status.getCode !== 'undefined')?status.getCode():'xx');
  this.team = status.team;
  this.distanceFromTop = status.distanceFromTop;
  this.distanceFromLeft = status.distanceFromLeft;
  this.health = status.health;
  this.healthGiven = status.healthGiven;
  this.livesSaved = status.livesSaved || 0;
  this.minesCaptured = status.minesCaptured;
  this.minesOwned = JSON.parse(JSON.stringify(status.minesOwned || {}));
  this.damageDone = status.damageDone;
  this.killCount = status.killCount || (status.heroesKilled?status.heroesKilled.length:0);
  this.gravesRobbed = status.gravesRobbed; // Why do we care?
  this._score = null;
  this.score = function () {
    if (this._score === null) {
      this._score = calculateStatusScore(this);
    }
    return this._score;
  }
}

// Gives a score (higher==better) for a given Status object.
// Different strategies could be defined by changing the weights
function calculateStatusScore(status) {
  'use strict';
  var totalScore = 0;
  // Win > alive > killCount > minesCaptured > healthGiven > damageDone
  if (status.health <= 0) {
    return -Infinity;
  }
  totalScore += (status.health > 50?100:0); // Being mostly healthy is good
  totalScore += status.killCount * 100;     // 100 per kill
  totalScore += status.livesSaved * 100;    // 100 per life saved
  totalScore += status.minesCaptured * 50;  // 50 per mine
  totalScore += status.healthGiven;         // 10~40 per heal
  totalScore += status.damageDone;          // 10~30 per attack
  totalScore += status.gravesRobbed * 5;    // Minor goal of getting boned
  return totalScore;
}

function getAdjacentEnemies(helpers, board, distanceFromTop, distanceFromLeft, team) {
  'use strict';
  var n = helpers.getTileNearby(board, distanceFromTop, distanceFromLeft, 'North');
  var e = helpers.getTileNearby(board, distanceFromTop, distanceFromLeft, 'East');
  var s = helpers.getTileNearby(board, distanceFromTop, distanceFromLeft, 'South');
  var w = helpers.getTileNearby(board, distanceFromTop, distanceFromLeft, 'West');
  var adjacent = [];
  if (n.team && n.team !== team) {
    adjacent.push(n);
  }
  if (e.team && e.team !== team) {
    adjacent.push(e);
  }
  if (s.team && s.team !== team) {
    adjacent.push(s);
  }
  if (w.team && w.team !== team) {
    adjacent.push(w);
  }
  return adjacent;
}

// Finds the score of a given move by determining what will happen
// when the hero attempts to move in the given direction. The score is recorded
// and then added to the best of all possible scores should the hero attempt another
// move from that new location/state by calling this function recursively.
// Scores are kept relevent by dividing the score by the depth, since things that
// would require several steps to complete are less probably going to actually happen.
// TODO: Improve the future prediction by updating the other heros on the board,
// making a best-guess for what each of them will do. (Maybe use this function, with
// a max depth of just 1.)
function evaluateMoveToPosition(helpers, board, startingStatus, direction, depth) {
  'use strict';
  // Gets the tile at the location that the hero wants to go to
  var status = new Status(startingStatus);
  var tile = (direction !== 'Stay')?helpers.getTileNearby(board, status.distanceFromTop, status.distanceFromLeft, direction):board.tiles[status.distanceFromTop][status.distanceFromLeft];
  var d = +depth + 1;
  var action = '';
  var adjacentEnemies, i;

  // Quit recursion if we hit a hard stop
  if (d === MAX_DEPTH || startingStatus.health <= 0 || tile === false) {
    return 0;
  }

  if (direction === 'Stay') {
    action = 'Stay';

  } else {
    // Determine results of the move
    if (tile.type === 'Unoccupied') {
      status.distanceFromTop = tile.distanceFromTop;
      status.distanceFromLeft = tile.distanceFromLeft;
      action = 'Walk';

    } else if (tile.subType === 'Bones') {
      status.gravesRobbed++;
      status.distanceFromTop = tile.distanceFromTop;
      status.distanceFromLeft = tile.distanceFromLeft;
      action = 'Walk';

    } else if (tile.type === 'DiamondMine') {
      if (!status.minesOwned.hasOwnProperty(tile.id)) {
        status.health -= DIAMOND_MINE_CAPTURE_DAMAGE;
        status.minesCaptured++;
        status.minesOwned[tile.id] = true;
        action = 'ClaimMine';
      } else {
        action = 'ERROR: Attempted to reclaim owned mine';
      }


    } else if (tile.type === 'HealthWell') {
      action = 'Cure ' + (Math.min(status.health + HEALTH_WELL_HEAL_AMOUNT, 100) - status.health);
      status.health += HEALTH_WELL_HEAL_AMOUNT;
      status.health = Math.min(status.health, 100); // Ensure we are accurate about how much healing is done

    } else if (tile.type === 'Hero' && tile.getCode() !== status.code) {
      if (tile.team !== status.team) {
        status.damageDone += HERO_FOCUSED_ATTACK_DAMAGE;
        action = 'Focused';
        if (tile.health <= (HERO_FOCUSED_ATTACK_DAMAGE + HERO_ATTACK_DAMAGE)  && tile.health > HERO_ATTACK_DAMAGE) {
          // Increment kill count gained from the focused attack
          status.killCount++;
          action += ' K';
        }
      } else {
        //console.log('tile.code:' + tile.getCode(), 'status.code:' + status.code);
        status.healthGiven += Math.min(HERO_HEAL_AMOUNT + tile.health, 100) - tile.health; // Ensure we are accurate about how much healing is done
        action = 'Heal ' + (Math.min(HERO_HEAL_AMOUNT + tile.health, 100) - tile.health);
        adjacentEnemies = getAdjacentEnemies(helpers, board, tile.distanceFromTop, tile.distanceFromLeft, status.team);
        // Count lives saved as those that are in immediate danger of being attacked and wouldn't survive it
        // TODO: Improve this estimate by looking at enemies that could move and then still do damage to the friend. Ex:
        // Friend is at 70 health and has one neighboring enemy, so healing him now would seem to be less efficient than waiting
        // for him to take more damage. But then two more enemies move in and the adjacent enemy makes a focused attack,
        // killing our friend.
        if (tile.health <= adjacentEnemies * (HERO_FOCUSED_ATTACK_DAMAGE + HERO_ATTACK_DAMAGE)) {
          status.livesSaved++;
          action += 'Save'
        }
      }
    } else if (tile.type === 'Hero' && tile.getCode() === status.code) {
      action = 'Return';
    }
  }

  // Calculate damage and kills to adjacent enemies
  adjacentEnemies = getAdjacentEnemies(helpers, board, status.distanceFromTop, status.distanceFromLeft, status.team);
  // TODO: Right now we assume they don't move and also don't attack,
  // Impreove this by guessing their course of action
  status.health -= adjacentEnemies.length * HERO_ATTACK_DAMAGE;
  status.damageDone = HERO_ATTACK_DAMAGE * adjacentEnemies.length;
  for (i = 0; i < adjacentEnemies.length; ++i) {
    action += 'd';
    if (adjacentEnemies.health <= HERO_ATTACK_DAMAGE) {
      status.killCount++;
      action += 'k';
    }
  }

  var baselineScore = startingStatus.score() / d;
  //console.log('startingStatusScore:' + startingStatus.score(), 'baseline:' + baselineScore, 'statusScore:' + status.score());
  var scoreForThisStep = status.score() / d - baselineScore;
  //console.log(depth+1, Array(depth+1).join(' ') + direction, scoreForThisStep, action);
  var nextSteps = {
    North: evaluateMoveToPosition(helpers, board, status, 'North', d),
    East: evaluateMoveToPosition(helpers, board, status, 'East', d),
    South: evaluateMoveToPosition(helpers, board, status, 'South', d),
    West: evaluateMoveToPosition(helpers, board, status, 'West', d),
    Stay: evaluateMoveToPosition(helpers, board, status, 'Stay', d)
  };
  var bestNextStepScore = Math.max(
    nextSteps['North'],
    nextSteps['East'],
    nextSteps['South'],
    nextSteps['West'],
    nextSteps['Stay']
  );
  return scoreForThisStep + bestNextStepScore;
}

function move(gameData, helpers) {
  'use strict';
  var i = 0;
  var status = new Status(gameData.activeHero);
  var bestScore = -Infinity;
  var bestDirections = [];
  var curScore;

  while (i < DIRECTIONS.length) {
    if (DIRECTIONS[i] === 'Stay' || helpers.getTileNearby(gameData.board, status.distanceFromTop, status.distanceFromLeft, DIRECTIONS[i])) {

      //console.log('Evaluating Starting', DIRECTIONS[i]);
      curScore = evaluateMoveToPosition(helpers, gameData.board, status, DIRECTIONS[i], 0);
      //console.log('Total:',DIRECTIONS[i],curScore);
      //console.log('');
      if (curScore > bestScore) {
        bestScore = curScore;
        bestDirections = [DIRECTIONS[i]];
      } else if (curScore === bestScore) {
        bestDirections.push(DIRECTIONS[i]);
      }
    }
    ++i;
  }

  // Choose randomly from all the best possible choices
  //console.log('Choosing from:', bestDirections, bestScore);
  return bestDirections[~~(bestDirections.length * Math.random())];
}

module.exports = move;
