package org.example.dto;

import java.util.Map;

public class ExecutionDto {

    public static class Request {
        private Map<String, String> files;
        private String mainClass;
        private String sessionId;

        public Map<String, String> getFiles() {
            return files;
        }

        public void setFiles(Map<String, String> files) {
            this.files = files;
        }

        public String getMainClass() {
            return mainClass;
        }

        public void setMainClass(String mainClass) {
            this.mainClass = mainClass;
        }

        public String getSessionId() {
            return sessionId;
        }

        public void setSessionId(String sessionId) {
            this.sessionId = sessionId;
        }
    }

    public static class InputRequest {
        private String sessionId;
        private String input;

        public String getSessionId() {
            return sessionId;
        }

        public void setSessionId(String sessionId) {
            this.sessionId = sessionId;
        }

        public String getInput() {
            return input;
        }

        public void setInput(String input) {
            this.input = input;
        }
    }

    public static class Response {
        private String output;
        private String error;

        public Response() {
        }

        public Response(String output, String error) {
            this.output = output;
            this.error = error;
        }

        public String getOutput() {
            return output;
        }

        public void setOutput(String output) {
            this.output = output;
        }

        public String getError() {
            return error;
        }

        public void setError(String error) {
            this.error = error;
        }
    }
}