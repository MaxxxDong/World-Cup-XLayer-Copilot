// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract WorldCupTriMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Outcome {
        None,
        TeamA,
        TeamB,
        Draw,
        Void
    }

    struct Market {
        string matchId;
        string teamA;
        string teamB;
        uint256 closeTime;
        uint256 maxTotalPool;
        uint256 maxUserStake;
        uint256 totalPool;
        bool closed;
        bool exists;
        Outcome resolvedOutcome;
        uint256 teamAPool;
        uint256 teamBPool;
        uint256 drawPool;
    }

    IERC20 public immutable stakeToken;
    uint16 public immutable feeBps;
    address public immutable feeRecipient;
    uint256 public nextMarketId = 1;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public userOutcomeStake;
    mapping(uint256 => mapping(address => uint256)) public userTotalStake;
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(uint256 => uint256) public collectedFees;

    event MarketCreated(
        uint256 indexed marketId,
        string matchId,
        string teamA,
        string teamB,
        uint256 closeTime,
        uint256 maxTotalPool,
        uint256 maxUserStake
    );
    event Bought(uint256 indexed marketId, address indexed user, Outcome indexed outcome, uint256 amount);
    event MarketClosed(uint256 indexed marketId);
    event MarketResolved(uint256 indexed marketId, Outcome indexed outcome, uint256 feeAmount);
    event Claimed(uint256 indexed marketId, address indexed user, uint256 payout);
    event FeesClaimed(uint256 indexed marketId, address indexed recipient, uint256 amount);

    error InvalidOutcome();
    error InvalidMarket();
    error MarketAlreadyClosed();
    error MarketNotClosed();
    error MarketAlreadyResolved();
    error MarketNotResolved();
    error MarketLimitExceeded();
    error UserLimitExceeded();
    error NothingToClaim();
    error AlreadyClaimed();
    error WinningPoolEmpty();

    constructor(IERC20 stakeToken_, address feeRecipient_, uint16 feeBps_) Ownable(msg.sender) {
        require(address(stakeToken_) != address(0), "stake token required");
        require(feeRecipient_ != address(0), "fee recipient required");
        require(feeBps_ <= 500, "fee too high");
        stakeToken = stakeToken_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
    }

    function createMarket(
        string calldata matchId,
        string calldata teamA,
        string calldata teamB,
        uint256 closeTime,
        uint256 maxTotalPool,
        uint256 maxUserStake
    ) external onlyOwner returns (uint256 marketId) {
        require(closeTime > block.timestamp, "close time must be future");
        require(maxTotalPool > 0, "market limit required");
        require(maxUserStake > 0 && maxUserStake <= maxTotalPool, "user limit invalid");

        marketId = nextMarketId++;
        markets[marketId] = Market({
            matchId: matchId,
            teamA: teamA,
            teamB: teamB,
            closeTime: closeTime,
            maxTotalPool: maxTotalPool,
            maxUserStake: maxUserStake,
            totalPool: 0,
            closed: false,
            exists: true,
            resolvedOutcome: Outcome.None,
            teamAPool: 0,
            teamBPool: 0,
            drawPool: 0
        });

        emit MarketCreated(marketId, matchId, teamA, teamB, closeTime, maxTotalPool, maxUserStake);
    }

    function buy(uint256 marketId, Outcome outcome, uint256 amount) external nonReentrant {
        if (!_isTradableOutcome(outcome)) revert InvalidOutcome();
        Market storage market = markets[marketId];
        if (!market.exists) revert InvalidMarket();
        if (market.closed || block.timestamp >= market.closeTime) revert MarketAlreadyClosed();
        if (market.resolvedOutcome != Outcome.None) revert MarketAlreadyResolved();
        require(amount > 0, "amount required");
        if (market.totalPool + amount > market.maxTotalPool) revert MarketLimitExceeded();
        if (userTotalStake[marketId][msg.sender] + amount > market.maxUserStake) revert UserLimitExceeded();

        stakeToken.safeTransferFrom(msg.sender, address(this), amount);

        uint8 outcomeIndex = uint8(outcome);
        userOutcomeStake[marketId][outcomeIndex][msg.sender] += amount;
        userTotalStake[marketId][msg.sender] += amount;
        market.totalPool += amount;

        if (outcome == Outcome.TeamA) market.teamAPool += amount;
        if (outcome == Outcome.TeamB) market.teamBPool += amount;
        if (outcome == Outcome.Draw) market.drawPool += amount;

        emit Bought(marketId, msg.sender, outcome, amount);
    }

    function closeMarket(uint256 marketId) external onlyOwner {
        Market storage market = markets[marketId];
        if (!market.exists) revert InvalidMarket();
        if (market.closed) revert MarketAlreadyClosed();
        market.closed = true;
        emit MarketClosed(marketId);
    }

    function resolveMarket(uint256 marketId, Outcome outcome) external onlyOwner {
        if (!_isResolvableOutcome(outcome)) revert InvalidOutcome();
        Market storage market = markets[marketId];
        if (!market.exists) revert InvalidMarket();
        if (!market.closed && block.timestamp < market.closeTime) revert MarketNotClosed();
        if (market.resolvedOutcome != Outcome.None) revert MarketAlreadyResolved();
        if (outcome != Outcome.Void && _poolForOutcome(market, outcome) == 0) revert WinningPoolEmpty();

        market.closed = true;
        market.resolvedOutcome = outcome;

        uint256 feeAmount = 0;
        if (outcome != Outcome.Void && feeBps > 0) {
            feeAmount = (market.totalPool * feeBps) / 10_000;
            collectedFees[marketId] = feeAmount;
        }

        emit MarketResolved(marketId, outcome, feeAmount);
    }

    function claim(uint256 marketId) external nonReentrant {
        Market storage market = markets[marketId];
        if (!market.exists) revert InvalidMarket();
        Outcome resolvedOutcome = market.resolvedOutcome;
        if (resolvedOutcome == Outcome.None) revert MarketNotResolved();
        if (claimed[marketId][msg.sender]) revert AlreadyClaimed();

        uint256 payout;
        if (resolvedOutcome == Outcome.Void) {
            payout = userTotalStake[marketId][msg.sender];
        } else {
            uint256 winningStake = userOutcomeStake[marketId][uint8(resolvedOutcome)][msg.sender];
            if (winningStake > 0) {
                uint256 winningPool = _poolForOutcome(market, resolvedOutcome);
                uint256 distributablePool = market.totalPool - collectedFees[marketId];
                payout = (winningStake * distributablePool) / winningPool;
            }
        }

        if (payout == 0) revert NothingToClaim();
        claimed[marketId][msg.sender] = true;
        stakeToken.safeTransfer(msg.sender, payout);
        emit Claimed(marketId, msg.sender, payout);
    }

    function claimFees(uint256 marketId) external nonReentrant {
        uint256 amount = collectedFees[marketId];
        if (amount == 0) revert NothingToClaim();
        collectedFees[marketId] = 0;
        stakeToken.safeTransfer(feeRecipient, amount);
        emit FeesClaimed(marketId, feeRecipient, amount);
    }

    function getPools(uint256 marketId) external view returns (uint256 teamAPool, uint256 teamBPool, uint256 drawPool, uint256 totalPool) {
        Market storage market = markets[marketId];
        if (!market.exists) revert InvalidMarket();
        return (market.teamAPool, market.teamBPool, market.drawPool, market.totalPool);
    }

    function getOddsBps(uint256 marketId) external view returns (uint256 teamAOddsBps, uint256 teamBOddsBps, uint256 drawOddsBps) {
        Market storage market = markets[marketId];
        if (!market.exists) revert InvalidMarket();
        uint256 distributablePool = market.totalPool - ((market.totalPool * feeBps) / 10_000);
        return (
            _oddsBps(distributablePool, market.teamAPool),
            _oddsBps(distributablePool, market.teamBPool),
            _oddsBps(distributablePool, market.drawPool)
        );
    }

    function _isTradableOutcome(Outcome outcome) private pure returns (bool) {
        return outcome == Outcome.TeamA || outcome == Outcome.TeamB || outcome == Outcome.Draw;
    }

    function _isResolvableOutcome(Outcome outcome) private pure returns (bool) {
        return outcome == Outcome.TeamA || outcome == Outcome.TeamB || outcome == Outcome.Draw || outcome == Outcome.Void;
    }

    function _poolForOutcome(Market storage market, Outcome outcome) private view returns (uint256) {
        if (outcome == Outcome.TeamA) return market.teamAPool;
        if (outcome == Outcome.TeamB) return market.teamBPool;
        if (outcome == Outcome.Draw) return market.drawPool;
        return 0;
    }

    function _oddsBps(uint256 distributablePool, uint256 outcomePool) private pure returns (uint256) {
        if (outcomePool == 0) return 0;
        return (distributablePool * 10_000) / outcomePool;
    }
}
