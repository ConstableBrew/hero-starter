// The Tactician
// Thinks deep into the future, weighing all options carefully before choosing a course of action.

var DIAMOND_MINE_CAPTURE_DAMAGE = 20;
var HERO_ATTACK_DAMAGE = 20;
var HERO_FOCUSED_ATTACK_DAMAGE = 10;
var HEALTH_WELL_HEAL_AMOUNT = 30;
var HERO_HEAL_AMOUNT = 40;

var DIRECTIONS = ['North', 'East', 'South', 'West', 'Stay'];
var MAX_DEPTH = 4;
var MAX_ENEMY_DEPTH = 2;

var GOAL_PROGRESSION_SCORE = 24; // Score for steps in the direction of our established strategic goal

var Safe_Health_Threshold = 50;
var Base_Health_Threshold = 30;

// Gives a score (higher==better) for a given Status object.
// Different Tactics could be defined by changing the weights
function calculateStatusScore(status) {
	'use strict';
	var totalScore = 0;
	// Win > alive > killCount > minesCaptured > healthGiven > damageDone
	if (status.health <= 0) {
		return -Infinity;
	}
	totalScore += (status.health > Safe_Health_Threshold ? 30 : 0); // 80 if over the safe level
	totalScore += (status.health > Base_Health_Threshold ? 50 : 0); // 50 if over the base level
																	// 0 if under or at the base level
	totalScore += status.killCount * 100;					// 100 per kill
	totalScore += status.livesSaved * 100;					// 100 per life saved
	totalScore += status.minesCaptured * 50;  				// 50 per mine
	totalScore += status.damageDone;						// 10~30 per attack
	totalScore += Math.max(status.healthGiven-15,0); 		// 0~25 per heal
	totalScore += status.gravesRobbed * 5;					// Minor goal of getting boned
	// Don't forget that GOAL_PROGRESSION_SCORE is added to moves in evaluateMoveToPosition function
	return totalScore;
}

// This function gives our hero a high level motivation, where the rest of the scoring mechanism
// are very low, tactical level. The direction returned by this function is used to add GOAL_PROGRESSION_SCORE
// to the calculatedStatusScore.
function directionToOverallStrategy(helpers, board, status) {
	var NearestEnemy = function(enemyTile) {return enemyTile.type === 'Hero' && enemyTile.team !== status.team;};
	var NearestHealthWell = function(enemyTile) {return enemyTile.type === 'HealthWell';};
	var strategy = NearestEnemy;
	if (status.health < Safe_Health_Threshold) {
		strategy = NearestHealthWell;
	}
	
	var pathInfoObject = helpers.findNearestObjectDirectionAndDistance(board, status, strategy);
  return pathInfoObject.direction;
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
function evaluateMoveToPosition(helpers, gameData, startingStatus, direction, depth) {
	'use strict';
	// Gets the tile at the location that the hero wants to go to
	var board = gameData.board;
	var status = new Status(startingStatus);
	var tile = (direction !== 'Stay')?helpers.getTileNearby(board, status.distanceFromTop, status.distanceFromLeft, direction):board.tiles[status.distanceFromTop][status.distanceFromLeft];
	var d = +depth + 1;
	var action = '';
	var adjacentEnemies, i;
	

	// Quit recursion if we hit a hard stop
	if (d === MAX_DEPTH || startingStatus.health <= 0 || tile === false) {
		return 0;
	}

	//console.log(d, direction)
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
					action += 'Save';
				}
			}
		} else if (tile.type === 'Hero' && tile.getCode() === status.code) {
			action = 'Return';
		}
	}

	// Calculate damage and kills to adjacent enemies
	adjacentEnemies = getAdjacentEnemies(helpers, board, status.distanceFromTop, status.distanceFromLeft, status.team);
	// TODO: Right now we assume they don't move and always attack,
	// Impreove this by guessing their course of action
	status.health -= adjacentEnemies.length * (HERO_ATTACK_DAMAGE + HERO_FOCUSED_ATTACK_DAMAGE);
	status.damageDone = (HERO_ATTACK_DAMAGE + HERO_FOCUSED_ATTACK_DAMAGE) * adjacentEnemies.length;
	for (i = 0; i < adjacentEnemies.length; ++i) {
		action += 'd';
		if (adjacentEnemies.health <= HERO_ATTACK_DAMAGE) {
			status.killCount++;
			action += 'k';
		}
	}

	var scoreForThisStep = status.score(startingStatus) / d;
	var bestNextStepScore = 0;
	
	// explore further options if this path is still viable.
	if (scoreForThisStep >= 0) {
		var strategicGoalDirection = directionToOverallStrategy(helpers, board, status);
		var strategicGoalScoreForThisStep = GOAL_PROGRESSION_SCORE / d;
		var updatedGameData = gameData;

		// Estimatie enemy actions. This is expensive and inaccurate, so we only do it for the first couple steps 
		if (d <= MAX_ENEMY_DEPTH) {
			var updatedGameData = deepCopy(gameData);
			if (startingStatus.distanceFromLeft !== status.distanceFromLeft || startingStatus.distanceFromTop !== status.distanceFromTop) {
				swapTiles(updatedGameData.board, 
					updatedGameData.board.tiles[status.distanceFromTop][status.distanceFromLeft],
					updatedGameData.board.tiles[startingStatus.distanceFromTop][startingStatus.distanceFromLeft]
				);
			}
			updateAllOtherHeros(updatedGameData, status.code, helpers);
		}

		var nextSteps = {
			North: evaluateMoveToPosition(helpers, updatedGameData, status, 'North', d),
			East: evaluateMoveToPosition(helpers, updatedGameData, status, 'East', d),
			South: evaluateMoveToPosition(helpers, updatedGameData, status, 'South', d),
			West: evaluateMoveToPosition(helpers, updatedGameData, status, 'West', d),
			Stay: evaluateMoveToPosition(helpers, updatedGameData, status, 'Stay', d)
		};
		nextSteps[strategicGoalDirection] += strategicGoalScoreForThisStep;
		bestNextStepScore = Math.max(
			nextSteps.North,
			nextSteps.East,
			nextSteps.South,
			nextSteps.West,
			nextSteps.Stay
		);
	} else {
		bestNextStepScore = 0;
	}
	return scoreForThisStep + bestNextStepScore;
}




function move(gameData, helpers) {
	'use strict';
	var i = 0;
	var status = new Status(gameData.activeHero);
	var bestScore = -Infinity;
	var bestDirections = [];
	var strategicGoalDirection = directionToOverallStrategy(helpers, gameData.board, status);
	var strategicGoalScoreForThisStep = GOAL_PROGRESSION_SCORE;
	var curScore;
	var dt = Date.now();

	while (i < DIRECTIONS.length) {
		if (DIRECTIONS[i] === 'Stay' || helpers.getTileNearby(gameData.board, status.distanceFromTop, status.distanceFromLeft, DIRECTIONS[i])) {
			curScore = evaluateMoveToPosition(helpers, gameData, status, DIRECTIONS[i], 0);
			curScore += (DIRECTIONS[i] === strategicGoalDirection ? strategicGoalScoreForThisStep : 0);
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
	//console.log('Best directions(' + bestScore + '): ' + bestDirections);
	console.log('Evaluation took ' + (Date.now() - dt) + 'ms');
	return bestDirections[~~(bestDirections.length * Math.random())];
}





// Holds the current state of the hero at any given point, with all relevant accumulated actions
function Status(status) {
	'use strict';
	// Simplification of hero's status
	// status parameter may be a Hero object or a Status object
	var self = {};
	self.code = status.code || ((status.getCode !== 'undefined')?status.getCode():'xx');
	self.team = status.team;
	self.distanceFromTop = status.distanceFromTop;
	self.distanceFromLeft = status.distanceFromLeft;
	self.health = status.health;
	self.healthGiven = status.healthGiven;
	self.livesSaved = status.livesSaved || 0;
	self.minesCaptured = status.minesCaptured;
	self.minesOwned = JSON.parse(JSON.stringify(status.minesOwned || {}));
	self.damageDone = status.damageDone;
	self.killCount = status.killCount || (status.heroesKilled?status.heroesKilled.length:0);
	self.gravesRobbed = status.gravesRobbed; // Why do we care?
	self._score = null;
	self.score = function (baseStatus) {
		if (this._score === null) {
			// We want only the score of the delta
			if (baseStatus) {
				self.healthGiven -= baseStatus.healthGiven;
				self.livesSaved -= baseStatus.livesSaved;
				self.minesCaptured -= baseStatus.minesCaptured;
				self.damageDone -= baseStatus.damageDone;
				self.killCount -= baseStatus.killCount;
				self.gravesRobbed -= baseStatus.gravesRobbed;
			}
			this._score = calculateStatusScore(this);
		}
		return this._score;
	};
	return self;
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


function updateAllOtherHeros(gameData, activeHeroCode, helpers) {
	var hero, direction;
	for (hero in gameData.heros) {
		if (hero.code !== activeHeroCode && hero.health > 0) {
			direction = getProbableHeroMove(hero, gameData, helpers);
			handleHeroMove(gameData.board, hero, direction);
		}
	}
}


// Estimate the likely move of a hero
function getProbableHeroMove(hero, gameData, helpers) {
	'use strict';
	var moves = {};
	var i = 0;
	var bestScore = -Infinity;
	var bestDirections = [];

	if (hero.health <= Base_Health_Threshold) {
		// Assume that all heros will prioritize getting healed when very low on health
		return helpers.findNearestHealthWell(gameData);
	}

	if (hero.health < Safe_Health_Threshold) {
		moves[helpers.findNearestHealthWell(gameData)] = 1;
	}
	moves[helpers.findNearestTeamMember(gameData)] += 1; 	// Priests
	moves[helpers.findNearestEnemy(gameData)] += 1; 		// Unwise Assassins
	moves[helpers.findNearestWeakerEnemy(gameData)] += 1; 	// Careful Assassins
	moves[helpers.findNearestNonTeamDiamondMine(gameData)] += 1; // Miners
	
	while (i < moves.length) {
		if (moves[i] > bestScore) {
			bestScore = moves[i];
			bestDirections = [i];
		} else if (moves[i] === bestScore) {
			bestDirections.push(i);
		}
		++i;
	}

	// Choose randomly from all the best possible choices
	return bestDirections[~~(bestDirections.length * Math.random())];

}


function handleHeroMove(board, hero, direction) {
  var tile = board.getTileNearby(hero.distanceFromTop, hero.distanceFromLeft, direction);
  if (!tile) {
  	tile = board.tiles[hero.distanceFromTop][hero.distanceFromLeft];
  }

  if (tile === false) {
	return;
  } else if (tile.type === 'Unoccupied') {
  	swapTiles(board, tile, hero);
  } else if (tile.type === 'DiamondMine') {
	hero.health -= DIAMOND_MINE_CAPTURE_DAMAGE;
	if (hero.health > 0) {
	  tile.owner = hero;
	}
  } else if (tile.type === 'HealthWell') {
	hero.health += HEALTH_WELL_HEAL_AMOUNT;
  } else if (tile.type === 'Hero') {
	if (tile.team !== hero.team) {
	  tile.health -= HERO_FOCUSED_ATTACK_DAMAGE;
	} else {
	  tile.health += HERO_HEAL_AMOUNT;
	}
  }
}

function deepCopy(obj) {
	if(obj === null || typeof(obj) !== 'object'){
		return obj;
	}
	//make sure the returned object has the same prototype as the original
	var ret = Object.create(obj.constructor.prototype);
	for(var key in obj){
		ret[key] = deepCopy(obj[key]);
	}
	return ret;
}

function swapTiles(board, a, b) {
	var x = b.distanceFromLeft;
	var y = b.distanceFromTop;
	b.distanceFromTop = a.distanceFromTop;
	b.distanceFromLeft = a.distanceFromLeft;
	a.distanceFromTop = y;
	a.distanceFromLeft = x;
	board.tiles[y][x] = a;
	board.tiles[b.distanceFromTop][b.distanceFromLeft] = b;
}

// Must be the last line
module.exports = move;