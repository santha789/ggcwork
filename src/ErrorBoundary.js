import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from './theme';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, msg: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, msg: error && error.message ? String(error.message) : '' };
  }

  componentDidCatch(error, info) {
    console.log('ErrorBoundary:', error && error.message, info && info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, msg: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.safe}>
          <ScrollView contentContainerStyle={styles.body}>
            <MaterialIcons name="error-outline" size={44} color={colors.accentLight} />
            <Text style={styles.title}>Terjadi Kesalahan</Text>
            <Text style={styles.sub}>Aplikasi menemui kendala yang tidak terduga.</Text>
            <Text style={styles.msg} numberOfLines={4}>
              {this.state.msg || 'Kesalahan tidak diketahui.'}
            </Text>
            <TouchableOpacity style={styles.btn} onPress={this.reset} activeOpacity={0.8}>
              <Text style={styles.btnText}>Coba Lagi</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: 'bold',
  },
  sub: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  msg: {
    color: colors.yellow,
    fontSize: 12,
    textAlign: 'center',
  },
  btn: {
    marginTop: 10,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  btnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});