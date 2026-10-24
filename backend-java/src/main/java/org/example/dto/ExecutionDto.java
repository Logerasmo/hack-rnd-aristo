package org.example.dto;

import java.util.Map;



public class ExecutionDto {

    public static class Request {
        private Map<String, String> files;
        private String mainClass;

        public Map<String, String> getFiles() { return files; }
        public  void setFiles(Map<String, String> files) { this.files = files; }
        public String getMainClass() {return mainClass; }
        public void setMainClass(String mainClass) { this.mainClass = mainClass; }

    }
    public static class Response {
        private  String output;
        private String error;

        public Response(String output, String error) {
            this.output = output;
            this.error = error;

        }

        public String getOutput() {return output; }
        public String getError() {return error; }
    }

}