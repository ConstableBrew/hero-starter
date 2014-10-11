/*
  if I move here,
    what will my health be?
    How much damage will I deal?
    How many diamonds will I gain?
    How much will I heal others?
    Will I have a path to a health well or trusted friend?

  Who can I trust
    to heal me?
    to not steal my diamonds?
  Who can I not trust?
    stole my diamonds?
    did not heal me?
  Do my friends need help right now? Soon?

  Is my team winning?
    Am I the wealthiest on my team?

*/
var DIAMOND_MINE_CAPTURE_DAMAGE = 20;
var HERO_ATTACK_DAMAGE = 20;
var HERO_FOCUSED_ATTACK_DAMAGE = 10;
var HEALTH_WELL_HEAL_AMOUNT = 30;
var HERO_HEAL_AMOUNT = 40;

var SCORE_NORMALIZE = Math.log(HERO_ATTACK_DAMAGE);
var DIRECTIONS = ['North', 'East', 'South', 'West', 'Stay'];
var MAX_DEPTH = 4;


function Status(status){
  // Simplification of hero's status
  // status parameter may be a Hero object or a Status object
  this.team = status.team;
  this.distanceFromTop = status.distanceFromTop;
  this.distanceFromLeft = status.distanceFromLeft;
  this.health = status.health;
  this.healthGiven = status.healthGiven;
  this.livesSaved = status.livesSaved || 0
  this.minesCaptured = status.minesCaptured;
  this.minesOwned = status.minesOwned || {};
  this.damageDone = status.damageDone;
  this.killCount = status.killCount || status.heroesKilled.length;
  this.gravesRobbed = status.gravesRobbed; // Why do we care?
}


module.exports = function(gameData, helpers) {
  return chooseBestMove(gameData, helpers);
};

function chooseBestMove(gameData, helpers) {
  var i=0;
  var status = new Status(gameData.activeHero);
  var bestScore = -Infinity;
  var bestDirections = []

  for(; i<DIRECTIONS.length; ++i) {
    curScore = evaluateMoveToPosition(helpers, gameData.board, status, DIRECTIONS[i], MAX_DEPTH);
    if (curScore > bestScore) {
      bestScore = curScore;
      bestDirections = [DIRECTIONS[i]];
    } else if (curScore === bestScore) {
      bestDirections.push(DIRECTIONS[i]);
    }
  }

  // Choose randomly from all the best possible choices
  return bestDirections[bestDirections.length * Math.random()];
}

function evaluateMoveToPosition(helpers, board, startingStatus, direction, depth){
  // Gets the tile at the location that the hero wants to go to
  var status = new Status(startingStatus);
  var tile = helpers.getTileNearby(board, status.distanceFromTop, status.distanceFromLeft, direction);
  var adjacentEnemies, i;

  if (--depth <= 0 || startingStatus.health <= 0) {
    return startingStatus;
  }

  if (direction !== 'Stay') {
    // If tile is not on the board (invalid coordinates), don't move
    if (tile === false) {
      tile = board.tiles[status.distanceFromTop][status.distanceFromLeft];

    // Determine results of the move
    } else {
      if (tile.type === 'Unoccupied') {
        status.distanceFromTop = tile.distanceFromTop;
        status.distanceFromLeft = tile.distanceFromLeft;

      }else if (tile.subType === 'Bones') {
        status.gravesRobbed++;
        status.distanceFromTop = tile.distanceFromTop;
        status.distanceFromLeft = tile.distanceFromLeft;

      }else if (tile.type === 'DiamondMine') {
        if (!status.minesOwned.hasOwnProperty(tile.id)){
          status.health -= DIAMOND_MINE_CAPTURE_DAMAGE;
          status.minesCaptured++;
          status.minesOwned[tile.id] = true;
        }

      } else if (tile.type === 'HealthWell') {
        status.health += HEALTH_WELL_HEAL_AMOUNT;
        status.health = Math.min(status.health, 100); // Ensure we are accurate about how much healing is done

      } else if (tile.type === 'Hero') {
        if (tile.team !== status.team) {
          status.damageDone += HERO_FOCUSED_ATTACK_DAMAGE;
          if (tile.health <= (HERO_FOCUSED_ATTACK_DAMAGE + HERO_ATTACK_DAMAGE)  && tile.health > HERO_ATTACK_DAMAGE) {
            // Increment kill count gained from the focused attack
            status.killCount++;
          }
        } else {
          status.healthGiven += Math.min(HERO_HEAL_AMOUNT + tile.health, 100) - tile.health; // Ensure we are accurate about how much healing is done
          adjacentEnemies = getAdjacentEnemies(helpers, board, tile.distanceFromTop, tile.distanceFromLeft, status.team);
          // Count lives saved as those that are in immediate danger of being attacked and wouldn't survive it
          // TODO: Improve this estimate by looking at enemies that could move and then still do damage
          if (tile.health <= adjacentEnemies * (HERO_FOCUSED_ATTACK_DAMAGE + HERO_ATTACK_DAMAGE)) {
            status.livesSaved++;
          }
        }
      }
    }
  }

  // Calculate damage and kills to adjacent enemies
  adjacentEnemies = getAdjacentEnemies(helpers, board, status.distanceFromTop, status.distanceFromLeft, status.team);
  status.damageDone = HERO_ATTACK_DAMAGE * adjacentEnemies.length;
  for (i=0; i<adjacentEnemies.length; ++i){
    if (adjacentEnemies.health <= HERO_ATTACK_DAMAGE) {
      status.killCount++;
    }
  }

  return Math.max(
      calculateStatusScoreevaluateMoveToPosition(helpers, board, status, 'North', depth)),
      calculateStatusScoreevaluateMoveToPosition(helpers, board, status, 'East', depth)),
      calculateStatusScoreevaluateMoveToPosition(helpers, board, status, 'South', depth)),
      calculateStatusScoreevaluateMoveToPosition(helpers, board, status, 'West', depth)),
      calculateStatusScoreevaluateMoveToPosition(helpers, board, status, 'Stay', depth))
    );
}

function getAdjacentEnemies(helpers, board, distanceFromTop, distanceFromLeft, team) {
  var n = helpers.getTileNearby(board, distanceFromTop, distanceFromLeft, 'North');
  var e = helpers.getTileNearby(board, distanceFromTop, distanceFromLeft, 'East');
  var s = helpers.getTileNearby(board, distanceFromTop, distanceFromLeft, 'South');
  var w = helpers.getTileNearby(board, distanceFromTop, distanceFromLeft, 'West');
  var adjacent = [];
  if (n.team && n.team !== team) adjacent.push n;
  if (e.team && e.team !== team) adjacent.push e;
  if (s.team && s.team !== team) adjacest.push s;
  if (w.team && w.team !== team) adjacewt.push w;
  return adjacent;
}

function calculateStatusScore(status) {
  var totalScore = 0;
  // Win > alive > killCount > healthGiven > damageDone > minesCaptured
  if (status.health <= 0) {
    return -Infinity;
  }
  totalScore += status.killCount * 100;
  totalScore += status.livesSaved * 100;
  totalScore += Math.log(status.healthGiven * 1.5) / SCORE_NORMALIZE;
  totalScore += Math.log(status.damageDone * 1.0) / SCORE_NORMALIZE;
  totalScore += status.minesCaptured * 50;
}
