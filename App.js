import React, {Component} from 'react';

import {
  AppRegistry,
  StyleSheet,
  Text,
  View,
  TouchableHighlight,
  Platform,
  PermissionsAndroid,
  Alert,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';

import Sound from 'react-native-sound';
import {AudioRecorder, AudioUtils} from 'react-native-audio';
import RNFetchBlob from 'react-native-fetch-blob';
import Voice from 'react-native-voice';

const xmlbuilder = require('xmlbuilder');

export default class App extends React.Component {
    constructor(props) {
      super(props);
      this.state = {
        currentTime: 0.0,
        recording: false,
        paused: false,
        stoppedRecording: false,
        finished: false,
        audioPath: AudioUtils.DocumentDirectoryPath + '/test.aac',
        audioTTSPath: AudioUtils.DocumentDirectoryPath + '/tts.wav',
        hasPermission: undefined,
        accessToken: '',
        text: '',
        recognized: undefined,
        started: undefined,
        results: [],
      };

      Voice.onSpeechStart = this._onSpeechStart.bind(this);
      Voice.onSpeechRecognized = this._onSpeechRecognized.bind(this);
      Voice.onSpeechResults = this._onSpeechResults.bind(this);
    }

    prepareRecordingPath(audioPath){
      AudioRecorder.prepareRecordingAtPath(audioPath, {
        SampleRate: 22050,
        Channels: 1,
        AudioQuality: "Low",
        AudioEncoding: "aac",
        AudioEncodingBitRate: 32000
      });
    }

    componentWillUnmount() {
      Voice.destroy().then(Voice.removeAllListeners);
    }

    componentDidMount() {
      AudioRecorder.requestAuthorization().then((isAuthorised) => {
        this.setState({ hasPermission: isAuthorised });

        if (!isAuthorised) return;

        this.prepareRecordingPath(this.state.audioPath);

        AudioRecorder.onProgress = (data) => {
          this.setState({currentTime: Math.floor(data.currentTime)});
        };

        AudioRecorder.onFinished = (data) => {
          // Android callback comes in the form of a promise instead.
          if (Platform.OS === 'ios') {
            this._finishRecording(data.status === "OK", data.audioFileURL, data.audioFileSize);
          }
        };
      });

      fetch('https://eastasia.api.cognitive.microsoft.com/sts/v1.0/issuetoken', {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': 'd42801d244b946f0841ce8cd137403ac',
        },
      })
      .then((response) => response.text())
      .then((token) => {
        //console.log(token);
        this.setState({accessToken:token});
      })
      .catch((error) => {
        console.error(error);
      });
    }

    _renderButton(title, onPress, active) {
      var style = (active) ? styles.activeButtonText : styles.buttonText;

      return (
        <TouchableHighlight style={styles.button} onPress={onPress}>
          <Text style={style}>
            {title}
          </Text>
        </TouchableHighlight>
      );
    }

    _renderPauseButton(onPress, active) {
      var style = (active) ? styles.activeButtonText : styles.buttonText;
      var title = this.state.paused ? "RESUME" : "PAUSE";
      return (
        <TouchableHighlight style={styles.button} onPress={onPress}>
          <Text style={style}>
            {title}
          </Text>
        </TouchableHighlight>
      );
    }

    async _pause() {
      if (!this.state.recording) {
        console.warn('Can\'t pause, not recording!');
        return;
      }

      try {
        const filePath = await AudioRecorder.pauseRecording();
        this.setState({paused: true});
      } catch (error) {
        console.error(error);
      }
    }

    async _resume() {
      if (!this.state.paused) {
        console.warn('Can\'t resume, not paused!');
        return;
      }

      try {
        await AudioRecorder.resumeRecording();
        this.setState({paused: false});
      } catch (error) {
        console.error(error);
      }
    }

    async _stop() {
      if (!this.state.recording) {
        console.warn('Can\'t stop, not recording!');
        return;
      }

      this.setState({stoppedRecording: true, recording: false, paused: false});

      try {
        const filePath = await AudioRecorder.stopRecording();

        if (Platform.OS === 'android') {
          this._finishRecording(true, filePath);
        }
        return filePath;
      } catch (error) {
        console.error(error);
      }
    }

    async _play() {
      if (this.state.recording) {
        await this._stop();
      }

      // These timeouts are a hacky workaround for some issues with react-native-sound.
      // See https://github.com/zmxv/react-native-sound/issues/89.
      setTimeout(() => {
        var sound = new Sound(this.state.audioPath, '', (error) => {
          if (error) {
            console.log('failed to load the sound', error);
          }
        });

        setTimeout(() => {
          sound.play((success) => {
            if (success) {
              console.log('successfully finished playing');
            } else {
              console.log('playback failed due to audio decoding errors');
            }
          });
        }, 100);
      }, 100);
    }

    async _record() {
      if (this.state.recording) {
        console.warn('Already recording!');
        return;
      }

      if (!this.state.hasPermission) {
        console.warn('Can\'t record, no permission granted!');
        return;
      }

      if(this.state.stoppedRecording){
        this.prepareRecordingPath(this.state.audioPath);
      }

      this.setState({recording: true, paused: false});

      try {
        const filePath = await AudioRecorder.startRecording();
      } catch (error) {
        console.error(error);
      }
    }

    _finishRecording(didSucceed, filePath, fileSize) {
      this.setState({ finished: didSucceed });
      console.log(`Finished recording of duration ${this.state.currentTime} seconds at path: ${filePath} and size of ${fileSize || 0} bytes`);
    }

    async _textToSpeech() {
      console.log('Access token: ' + this.state.accessToken);

      console.log('Text to speak: ' + this.state.text);

      const xml_body = xmlbuilder.create('speak')
        .att('version', '1.0')
        .att('xml:lang', 'vi-vn')
        .ele('voice')
        .att('xml:lang', 'vi-vn')
        .att('name', 'Microsoft Server Speech Text to Speech Voice (vi-VN, An)')
        .txt(this.state.text)
        .end();
      // Convert the XML into a string to send in the TTS request.
      const body = xml_body.toString();
      console.log('Body: ' + body);

      await RNFetchBlob
        .config({
          fileCache : true,
          appendExt : 'wav'
        })
        .fetch('POST', 'https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1', {
          'Authorization': 'Bearer ' + this.state.accessToken,
          'cache-control': 'no-cache',
          'User-Agent': 'speech-unibot',
          'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
          'Content-Type': 'application/ssml+xml'
        }, body,)
        .then((response) => {
          console.log('The file saved to ', response.path());
          this.setState({audioTTSPath: response.path()});
        })
        .catch((error) => {
          console.error(error);
        });

      // These timeouts are a hacky workaround for some issues with react-native-sound.
      // See https://github.com/zmxv/react-native-sound/issues/89.
      setTimeout(() => {
        var sound = new Sound(this.state.audioTTSPath, '', (error) => {
          if (error) {
            console.log('failed to load the sound', error);
          }
        });

        setTimeout(() => {
          sound.play((success) => {
            if (success) {
              console.log('successfully finished playing');
            } else {
              console.log('playback failed due to audio decoding errors');
            }
          });
        }, 100);
      }, 100);
    }

    _onSpeechStart(e) {
      this.setState({ started: true });
    };

    _onSpeechRecognized(e) {
      this.setState({ recognized: true });
    };

    _onSpeechResults(e) {
      console.log(e.value);
      this.setState({ results: e.value });
    }

    async _startRecognition(e) {
      this.setState({
        recognized: undefined,
        started: undefined,
        results: [],
      });
      try {
        await Voice.start('vi-VN');
      } catch (e) {
        console.error(e);
      }
    }

    render() {

      return (
        <KeyboardAvoidingView style={styles.container} behavior="padding" enabled>
          <View style={styles.controls}>
            <Text style={styles.devideText}>-----Record for Google STT API-----</Text>
            {this._renderButton("RECORD", () => {this._record()}, this.state.recording )}
            {this._renderButton("PLAY", () => {this._play()} )}
            {this._renderButton("STOP", () => {this._stop()} )}
            {/* {this._renderButton("PAUSE", () => {this._pause()} )} */}
            {this._renderPauseButton(() => {this.state.paused ? this._resume() : this._pause()})}
            <Text style={styles.progressText}>{this.state.currentTime}s</Text>
            <Text style={styles.devideText}>------------------------------</Text>
            {this._renderButton("Start SPEECH-TO-TEXT (Device’s native API)", () => {this._startRecognition()} )}
            <Text style={styles.resultText}>
                Result text of SPEECH-TO-TEXT :
            </Text>
            {this.state.results.map((result, index) => <Text key={index} style={styles.resultText}> {result}</Text>)}
            <Text style={styles.devideText}>------------------------------</Text>
            <TextInput
              style={{height: 60, borderColor: 'red', borderWidth: 1}}
              placeholder="Type here to speak!"
              onChangeText={(text) => this.setState({text})}
            />
            {this._renderButton("TEXT-TO-SPEECH (Microsoft)", () => {this._textToSpeech()} )}
          </View>
        </KeyboardAvoidingView>
      );
    }
}

const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#2b608a",
    },
    controls: {
      justifyContent: 'center',
      alignItems: 'center',
      flex: 1,
    },
    progressText: {
      paddingTop: 20,
      fontSize: 30,
      color: "#fff"
    },
    button: {
      padding: 15
    },
    disabledButtonText: {
      color: '#eee'
    },
    buttonText: {
      fontSize: 15,
      color: "#fff"
    },
    activeButtonText: {
      fontSize: 15,
      color: "#B81F00"
    },
    resultText: {
      color: '#fff',
      fontSize: 15,
    },
    devideText: {
      paddingTop: 20,
      paddingBottom: 20,
      fontSize: 20,
      color: "#fff"
    },
});
