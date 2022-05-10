import React, {
  useCallback,
  useRef,
} from "react";
import {
  useDispatch,
  useSelector,
} from "react-redux";

import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import Header from "../header/Header";

import { PortLostError } from "../../utils/Errors";
import Exploit from "../../utils/obfuscated-exploit/Exploit";
//import Exploit from "../../utils/exploit/Exploit";

import {
  appendToLog,
  reset,
  root,
  success,
  selectAttempted,
  selectLog,
  selectRooting,
} from "./rootSlice";

const exploit = new Exploit();

export default function Root() {
  const dispatch = useDispatch();

  const unlockStep = useRef(1);
  const disconnected = useRef(false);
  const rebooting = useRef(false);

  const attempted = useSelector(selectAttempted);
  const log = useSelector(selectLog);
  const rooting = useSelector(selectRooting);

  const renderedLog = log.map((line, index) => {
    const key = `${index}-${line}`;
    return (
      <ListItem key={key}>
        <Typography
          sx={{ fontFamily: "Monospace" }}
        >
          {line}
        </Typography>
      </ListItem>
    );
  });

  const handleClick = useCallback(async() => {
    dispatch(root());

    const log = (message) => {
      console.log(message);
      dispatch(appendToLog(message));
    };

    const runUnlock = async () => {
      if(unlockStep.current > 0) {
        let maxTry = 10;
        let currentTry = 0;
        let done = false;
        while(currentTry < maxTry && !done) {
          try {
            switch (unlockStep.current) {
              case 1: {
                if (currentTry === 0) {
                  log("Attempting Step 1...");
                }

                const device = await exploit.unlockStep1();

                log(` - Found Device: ${device}`);
                log("Step 1 - Success! Rebooting...");

                rebooting.current = true;
                unlockStep.current = 2;
                done = true;

                await exploit.restart();
              } break;

              case 2: {
                if (currentTry === 0) {
                  log("Attempting Step 2...");
                }
                const restart = await exploit.unlockStep2();

                unlockStep.current = 3;
                done = true;

                if(!restart) {
                  log("Step 2 - Success!");
                  await exploit.sleep(3000);
                  runUnlock();
                } else {
                  log("Step 2 - Success! Rebooting...");
                  rebooting.current = true;
                  await exploit.restart();
                }
              } break;

              case 3: {
                if (currentTry === 0) {
                  log("Attempting Step 3...");
                }
                await exploit.unlockStep3();
                log("Step 3 - Success!");

                unlockStep.current = 4;
                done = true;

                runUnlock();
              } break;

              case 4: {
                if (currentTry === 0) {
                  log("Attempting Step 4...");
                }
                await exploit.unlockStep4();
                log("Step 4 - Success! Rebooting...");

                rebooting.current = true;
                unlockStep.current = 5;
                done = true;

                try {
                  await exploit.restart();
                } catch (e) {
                  console.log("Device might already be restarting");
                  console.log(e);
                }
              } break;

              case 5: {
                if (currentTry === 0) {
                  log("Attempting Step 5...");
                }
                await exploit.unlockStep5();

                log("Step 5 - Success! Rebooting...");

                rebooting.current = true;
                unlockStep.current = 6;
                done = true;

                exploit.restart();
              } break;

              case 6: {
                log("All done - your device has been successfully rooted!");
                unlockStep.current = 0;
                done = true;

                try {
                  exploit.closePort();
                } catch(e) {
                  console.log(e);
                }

                dispatch(success());
              } break;

              default: {
                console.log("Unknown Unlock Step", unlockStep);
                done = true;
              }
            }
          } catch(e) {
            if(e instanceof PortLostError) {
              disconnected.current = true;
              break;
            } else {
              console.log(e);
              currentTry += 1;

              await exploit.sleep(1000);
            }
          }
        }

        if(!done && !disconnected.current) {
          log(`Failed after ${maxTry} retries.`);
          try {
            exploit.closePort();
          } catch (e) {
            console.log(e);
          }
        }

        if(!done && disconnected.current) {
          log("Device went away...");
        }
      }
    };

    const reConnect = async () => {
      disconnected.current = false;
      if(!rebooting.current && unlockStep.current > 0) {
        log("Device came back...");
      }
      rebooting.current = false;

      const ports = await navigator.serial.getPorts();
      if(ports.length > 0 ) {
        // Assume that the first available port is the device we are looking for.
        const port = ports[0];
        exploit.setPort(port);
        await exploit.makeConnection();

        // Run the next unlock step (or the failed one if device went away)
        runUnlock();
      }
    };

    navigator.serial.addEventListener("connect", reConnect);
    navigator.serial.addEventListener("disconnect", () => {
      console.log("Disconnect");
      disconnected.current = true;

      if(!rooting && attempted) {
        dispatch(reset);
      }
    });

    const triggerUnlock = async() => {
      await exploit.requestPort();

      runUnlock();
    };
    triggerUnlock();
  }, [attempted, dispatch, rooting]);

  return(
    <Container
      fixed
      sx={{ paddingBottom: 3 }}
    >
      <Header />

      <Stack spacing={2}>
        <Button
          disabled={rooting}
          onClick={handleClick}
          variant="contained"
        >
          Root Device
        </Button>

        {log.length > 0 &&
          <Paper>
            <List>
              {renderedLog}
            </List>
          </Paper>}
      </Stack>
    </Container>
  );
}