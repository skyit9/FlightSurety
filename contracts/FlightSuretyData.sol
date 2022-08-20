pragma solidity >=0.4.25;

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

contract FlightSuretyData {
    using SafeMath for uint256;

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    address private contractOwner;                                      // Account used to deploy contract
    bool private operational = true;                                    // Blocks all state changes throughout the contract if false
    uint256 public constant INSURANCE_PRICE_LIMIT = 1 ether;
    uint256 public constant MIN_FUND = 10 ether;
    uint8 private constant MULTIPARTY_AIRLINES_MIN = 4;

    mapping(address => uint256) private authorizedContracts;

    // Airline
    struct Airline {
        address airlineAddress;
        bool isRegistered;
        string name;
        uint256 funded;
        uint256 votes;
    }
    mapping(address => Airline) private airlines;
    uint256 public airlinesTotalCount;

    // Passenger
    struct Passenger {
        address passengerAddr;
        mapping(string => uint256) flightList;
        uint256 credit;
    }
    mapping(address => Passenger) private passengerList;
    address[] public passengerAddrList;

    /********************************************************************************************/
    /*                                       EVENT DEFINITIONS                                  */
    /********************************************************************************************/


    /**
    * @dev Constructor
    *      The deploying account becomes contractOwner
    */
    constructor
                                (
                                ) 
                                public 
    {
        contractOwner = msg.sender;
        authorizedContracts[msg.sender] = 1;
        passengerAddrList = new address[](0);
        airlines[msg.sender] = Airline({
            airlineAddress: msg.sender,
            isRegistered: true,
            name: "MyAirline",
            funded: 0,
            votes: 0
        });
        airlinesTotalCount = 1;
    }

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    // Modifiers help avoid duplication of code. They are typically used to validate something
    // before a function is allowed to be executed.

    /**
    * @dev Modifier that requires the "operational" boolean variable to be "true"
    *      This is used on all state changing functions to pause the contract in 
    *      the event there is an issue that needs to be fixed
    */
    modifier requireIsOperational() 
    {
        require(operational, "Contract is currently not operational");
        _;  // All modifiers require an "_" which indicates where the function body will be added
    }

    /**
    * @dev Modifier that requires the "ContractOwner" account to be the function caller
    */
    modifier requireContractOwner()
    {
        require(msg.sender == contractOwner, "Caller is not contract owner");
        _;
    }

    /**
    * @dev Modifier that requires the calling App contract has been authorized
    */
    modifier requireIsCallerAuthorized()
    {
        require(authorizedContracts[msg.sender] == 1, "Caller is not an authorized contract");
        _;
    }

    /**
    * @dev Modifier that requires the airline is registered
    */
    modifier requireIsRegistered(address airlineAddress)
    {
        require(!airlines[airlineAddress].isRegistered, "This Airline is Registered.");
        _;
    }

    /**
    * @dev Modifier that requires the airline is registered
    */
    modifier requireValidatedAddress(address airlineAddress)
    {
        require(airlineAddress != address(0), "The Airline address is invalid");
        _;
    }

    /**
    * @dev Modifier that requires contract is origin
    */
    modifier requireOriginContract(address addr)
    {
        require(addr == tx.origin, "The contract is not origin");
        _;
    }

    /**
    * @dev Modifier that requires sender need to have ETH
    */
    modifier requireSenderValue()
    {
        require(msg.value > 0, 'You dont have ETH to buy a flight insurance');
        _;
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    /**
    * @dev Get operating status of contract
    *
    * @return A bool that is the current operating status
    */      
    function isOperational() 
                            public 
                            view 
                            returns(bool) 
    {
        return operational;
    }

    function authorizeCaller
                            (
                                address contractAddress
                            )
                            external
                            requireContractOwner
    {
        authorizedContracts[contractAddress] = 1;
    }

    function isAuthorized
                            (
                                address contractAddress
                            )
                            external
                            view
                            returns(bool)
    {
        return(authorizedContracts[contractAddress] == 1);
    }

    function deauthorizeCaller
                            (
                                address contractAddress
                            )
                            external
                            requireContractOwner
    {
        delete authorizedContracts[contractAddress];
    }

    /**
    * @dev Sets contract operations on/off
    *
    * When operational mode is disabled, all write transactions except for this one will fail
    */    
    function setOperatingStatus
                            (
                                bool mode
                            ) 
                            external
                            requireIsCallerAuthorized
                            requireContractOwner 
    {
        operational = mode;
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

   /**
    * @dev Add an airline to the registration queue
    *      Can only be called from FlightSuretyApp contract
    *
    */   
    function registerAirline
                            (
                                address airlineAddress,
                                string calldata airlineName
                            )
                            external
                            requireIsCallerAuthorized
                            requireIsOperational
                            requireIsRegistered(airlineAddress)
                            requireValidatedAddress(airlineAddress)
                            returns (bool)
    {
        if(airlinesTotalCount < MULTIPARTY_AIRLINES_MIN){
            airlines[airlineAddress] = Airline({
                                                airlineAddress: airlineAddress,
                                                isRegistered: true,
                                                name: airlineName,
                                                funded: 0,
                                                votes: 1
                                        });
            airlinesTotalCount++;
        } else {
            vote(airlineAddress, airlineName);
        }
        return (true);
    }

    function vote (address voted, string memory airlineName) internal requireIsOperational {
        airlines[voted].votes++;
        if (airlines[voted].votes >= airlinesTotalCount.div(2) && !airlines[voted].isRegistered) {
            airlines[voted].isRegistered = true;
            airlines[voted].airlineAddress = voted;
            airlines[voted].name = airlineName;
            airlinesTotalCount++;
        }
    }

   /**
    * @dev Buy insurance for a flight
    *
    */   
    function buy
                            (         
                                string calldata flightID
                            )
                            external
                            payable
                            requireIsOperational
                            requireOriginContract(msg.sender)
                            requireSenderValue
                            returns (uint256, address, uint256)
    {
        if(!isExistedPassenger(msg.sender)){
            passengerAddrList.push(msg.sender);
        }

        if(passengerList[msg.sender].passengerAddr != msg.sender) {
            passengerList[msg.sender] = Passenger({
                                                    passengerAddr: msg.sender,
                                                    credit: 0
                                                });
            passengerList[msg.sender].flightList[flightID] = msg.value;
        } else {
            passengerList[msg.sender].flightList[flightID] = msg.value;
        }

        if (msg.value > INSURANCE_PRICE_LIMIT) {
            msg.sender.transfer(msg.value.sub(INSURANCE_PRICE_LIMIT));
        }
    }

    /**
     *  @dev Credits payouts to insurees
    */
    function creditInsurees
                                (
                                    string calldata flightID
                                )
                                external
                                requireIsOperational
    {
        for (uint256 index = 0; index < passengerAddrList.length; index++) {
            if(passengerList[passengerAddrList[index]].flightList[flightID] != 0) {
                uint256 savedCredit = passengerList[passengerAddrList[index]].credit;
                uint256 payedPrice = passengerList[passengerAddrList[index]].flightList[flightID];
                passengerList[passengerAddrList[index]].flightList[flightID] = 0;
                passengerList[passengerAddrList[index]].credit = savedCredit + payedPrice + payedPrice.div(2);
            }
        }
    }
    
    /**
     *  @dev Transfers eligible payout funds to insuree
     *
    */
    function withdraw
                            (
                                address payable passenger
                            )
                            public
                            requireIsOperational
                            requireOriginContract(passenger)
                            returns (uint256, uint256, uint256, uint256, address, address)
    {
        uint256 credit = passengerList[passenger].credit;
        require(credit > 0, "You dont not have credit");
        uint256 intContractBalance = address(this).balance;
        require(intContractBalance > credit, "The contract does not have enough funds to pay");
        passengerList[passenger].credit = 0;
        passenger.transfer(credit);
        return (intContractBalance, credit, address(this).balance, passengerList[passenger].credit, passenger, address(this));
    }

   /**
    * @dev Initial funding for the insurance. Unless there are too many delayed flights
    *      resulting in insurance payouts, the contract should be self-sustaining
    *
    */   
    function fund
                            (   
                            )
                            public
                            payable
                            requireIsOperational
    {
        airlines[msg.sender].funded = airlines[msg.sender].funded.add(msg.value);
    }

    function getFlightKey
                        (
                            address airline,
                            string memory flight,
                            uint256 timestamp
                        )
                        pure
                        internal
                        returns(bytes32) 
    {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    /**
    * @dev Fallback function for funding smart contract.
    *
    */
    function() 
                            external 
                            payable 
    {
        fund();
    }

    function isActived ( address airline) public view returns(bool) {
        return(airlines[airline].funded >= MIN_FUND);
    }

    function isRegistered ( address airline) public view returns(bool) {
        return(airlines[airline].isRegistered);
    }

    function getVotes(address airlineAddress) public view returns (uint256 votes) {
        return (airlines[airlineAddress].votes);
    }

    function isExistedPassenger(address passenger) internal view returns(bool isExisted){
        isExisted = false;
        for (uint256 index = 0; index < passengerAddrList.length; index++) {
            if (passengerAddrList[index] == passenger) {
                isExisted = true;
                break;
            }
        }
        return isExisted;
    }

    function getCreditToPay() external view returns (uint256) {
        return passengerList[msg.sender].credit;
    }

    function isAirline (
                            address airline
                        )
                        external
                        view
                        returns (bool) {
        return airlines[airline].airlineAddress == airline;
    }
}
